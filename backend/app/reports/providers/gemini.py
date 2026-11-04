import json
import time
from typing import Any, Dict, Optional
import httpx
from app.reports.providers.base import (
    BaseLLMProvider,
    LLMProviderError,
    LLMRateLimitedError,
    LLMTimeoutError,
)

BASE_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiLLMProvider(BaseLLMProvider):
    def __init__(
        self,
        api_key: str,
        model: str = "gemini-2.5-flash-lite",
        timeout_seconds: float = 20.0,
        transport: Optional[httpx.BaseTransport] = None,
    ):
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required for Gemini provider")
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    def generate(
        self,
        system: str,
        prompt: str,
        language: str,
        stats: Optional[Dict[str, Any]] = None,
    ) -> str:
        url = f"{BASE_GEMINI_URL}/{self.model}:generateContent"

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

        # One retry with short backoff on 429 and 5xx
        max_attempts = 2
        backoff_seconds = 0.05

        with httpx.Client(transport=self.transport, timeout=self.timeout_seconds) as client:
            for attempt in range(1, max_attempts + 1):
                try:
                    response = client.post(url, headers=headers, json=payload)
                except httpx.TimeoutException:
                    raise LLMTimeoutError("Request to Gemini API timed out")
                except httpx.RequestError as e:
                    raise LLMProviderError(f"Network error contacting Gemini API: {type(e).__name__}")

                if response.status_code == 200:
                    try:
                        data = response.json()
                        parts = data["candidates"][0]["content"]["parts"]
                        return parts[0]["text"]
                    except (KeyError, IndexError, json.JSONDecodeError) as e:
                        raise LLMProviderError(f"Unexpected response structure from Gemini: {e}")

                if response.status_code == 429:
                    if attempt < max_attempts:
                        time.sleep(backoff_seconds)
                        continue
                    raise LLMRateLimitedError("Gemini API rate limit exceeded (429)")

                if 500 <= response.status_code < 600:
                    if attempt < max_attempts:
                        time.sleep(backoff_seconds)
                        continue
                    raise LLMProviderError(f"Gemini server error ({response.status_code})")

                # Any other error code (e.g. 400, 401, 403)
                raise LLMProviderError(f"Gemini API returned status {response.status_code}")

        raise LLMProviderError("Max retries exceeded with Gemini API")
