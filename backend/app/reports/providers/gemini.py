import json
import random
import time
from typing import Any, Callable, Dict, List, Optional
import httpx
from app.reports.providers.base import (
    BaseLLMProvider,
    LLMProviderError,
    LLMRateLimitedError,
    LLMTimeoutError,
)

BASE_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"


def parse_retry_after(header: Optional[str]) -> Optional[float]:
    if not header:
        return None
    try:
        val = float(header.strip())
        return val if val >= 0 else None
    except ValueError:
        return None


class GeminiLLMProvider(BaseLLMProvider):
    def __init__(
        self,
        api_key: str,
        model: str = "gemini-2.5-flash-lite",
        fallback_models: Optional[List[str]] = None,
        timeout_seconds: float = 20.0,
        overall_budget_seconds: float = 25.0,
        transport: Optional[httpx.BaseTransport] = None,
        sleep_fn: Callable[[float], None] = time.sleep,
        clock_fn: Callable[[], float] = time.monotonic,
        jitter_fn: Optional[Callable[[], float]] = None,
    ):
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required for Gemini provider")
        self.api_key = api_key
        self.model = model
        self.fallback_models = fallback_models or []
        self.timeout_seconds = timeout_seconds
        self.overall_budget_seconds = overall_budget_seconds
        self.transport = transport
        self.sleep_fn = sleep_fn
        self.clock_fn = clock_fn
        self.jitter_fn = jitter_fn

        self.last_model_used: str = model
        self.last_attempts: int = 0

    def generate(
        self,
        system: str,
        prompt: str,
        language: str,
        stats: Optional[Dict[str, Any]] = None,
    ) -> str:
        models_to_try = [self.model] + [m for m in self.fallback_models if m and m != self.model]
        headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "system_instruction": {
                "parts": [{"text": system}]
            },
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.4,
            },
        }

        start_time = self.clock_fn()
        total_attempts = 0
        last_error_type: Optional[str] = None
        last_error_msg: str = "Max retries exceeded"

        for model_idx, current_model in enumerate(models_to_try):
            has_more_models = model_idx < (len(models_to_try) - 1)
            model_attempts = 0

            while model_attempts < 3:
                now = self.clock_fn()
                elapsed = now - start_time
                remaining_budget = self.overall_budget_seconds - elapsed
                if remaining_budget <= 0:
                    last_error_type = "timeout"
                    last_error_msg = "Overall time budget of 25 seconds exceeded"
                    break

                model_attempts += 1
                total_attempts += 1
                self.last_attempts = total_attempts
                self.last_model_used = current_model

                req_timeout = min(self.timeout_seconds, max(0.001, remaining_budget))
                url = f"{BASE_GEMINI_URL}/{current_model}:generateContent"

                try:
                    with httpx.Client(transport=self.transport, timeout=req_timeout) as client:
                        response = client.post(url, headers=headers, json=payload)
                except httpx.TimeoutException:
                    last_error_type = "timeout"
                    last_error_msg = "Request to Gemini API timed out"
                    if model_attempts < 3:
                        jitter = self.jitter_fn() if self.jitter_fn else random.uniform(0.01, 0.05)
                        backoff = (1.0 if model_attempts == 1 else 2.0) + jitter
                        if (self.clock_fn() - start_time) + backoff >= self.overall_budget_seconds:
                            last_error_type = "timeout"
                            last_error_msg = "Overall time budget exceeded during backoff"
                            break
                        self.sleep_fn(backoff)
                        continue
                    else:
                        break
                except httpx.RequestError as e:
                    last_error_type = "provider_error"
                    last_error_msg = f"Network error contacting Gemini API: {type(e).__name__}"
                    if model_attempts < 3:
                        jitter = self.jitter_fn() if self.jitter_fn else random.uniform(0.01, 0.05)
                        backoff = (1.0 if model_attempts == 1 else 2.0) + jitter
                        if (self.clock_fn() - start_time) + backoff >= self.overall_budget_seconds:
                            last_error_type = "timeout"
                            last_error_msg = "Overall time budget exceeded during backoff"
                            break
                        self.sleep_fn(backoff)
                        continue
                    else:
                        break

                if response.status_code == 200:
                    try:
                        data = response.json()
                        parts = data["candidates"][0]["content"]["parts"]
                        self.last_model_used = current_model
                        self.last_attempts = total_attempts
                        return parts[0]["text"]
                    except (KeyError, IndexError, json.JSONDecodeError) as e:
                        raise LLMProviderError(f"Unexpected response structure from Gemini: {e}")

                if response.status_code == 404:
                    last_error_type = "provider_error"
                    last_error_msg = f"Gemini model not found (404): {current_model}"
                    # Do not retry 404 on same model; try next model if available
                    if has_more_models:
                        break
                    else:
                        raise LLMProviderError(last_error_msg)

                if response.status_code == 429:
                    last_error_type = "rate_limited"
                    last_error_msg = "Gemini API rate limit exceeded (429)"
                    retry_after = parse_retry_after(response.headers.get("retry-after"))
                    if retry_after is not None:
                        if retry_after > 5.0:
                            raise LLMRateLimitedError(f"Gemini API rate limited with Retry-After {retry_after}s > 5s")
                        backoff = float(retry_after)
                    else:
                        jitter = self.jitter_fn() if self.jitter_fn else random.uniform(0.01, 0.05)
                        backoff = (1.0 if model_attempts == 1 else 2.0) + jitter

                    if model_attempts < 3:
                        if (self.clock_fn() - start_time) + backoff >= self.overall_budget_seconds:
                            last_error_type = "timeout"
                            last_error_msg = "Overall time budget exceeded during rate limit backoff"
                            break
                        self.sleep_fn(backoff)
                        continue
                    else:
                        raise LLMRateLimitedError("Gemini API rate limit exceeded (429) after 3 attempts")

                if response.status_code == 503:
                    last_error_type = "provider_error"
                    last_error_msg = "Gemini server error (503)"
                    if model_attempts < 3:
                        jitter = self.jitter_fn() if self.jitter_fn else random.uniform(0.01, 0.05)
                        backoff = (1.0 if model_attempts == 1 else 2.0) + jitter
                        if (self.clock_fn() - start_time) + backoff >= self.overall_budget_seconds:
                            last_error_type = "timeout"
                            last_error_msg = "Overall time budget exceeded during 503 backoff"
                            break
                        self.sleep_fn(backoff)
                        continue
                    else:
                        if has_more_models:
                            break
                        else:
                            raise LLMProviderError("Gemini server error (503) after retries")

                if response.status_code in {500, 502, 504}:
                    last_error_type = "provider_error"
                    last_error_msg = f"Gemini server error ({response.status_code})"
                    if model_attempts < 3:
                        jitter = self.jitter_fn() if self.jitter_fn else random.uniform(0.01, 0.05)
                        backoff = (1.0 if model_attempts == 1 else 2.0) + jitter
                        if (self.clock_fn() - start_time) + backoff >= self.overall_budget_seconds:
                            last_error_type = "timeout"
                            last_error_msg = f"Overall time budget exceeded during {response.status_code} backoff"
                            break
                        self.sleep_fn(backoff)
                        continue
                    else:
                        raise LLMProviderError(f"Gemini server error ({response.status_code}) after 3 attempts")

                # Any other status code (e.g. 400, 401, 403)
                raise LLMProviderError(f"Gemini API returned status {response.status_code}")

        # If exhausted attempts across all models without returning
        if last_error_type == "timeout":
            raise LLMTimeoutError(last_error_msg)
        elif last_error_type == "rate_limited":
            raise LLMRateLimitedError(last_error_msg)
        else:
            raise LLMProviderError(last_error_msg)
