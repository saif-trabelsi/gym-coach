from datetime import datetime, timezone
import logging
import math
import threading
import time
from typing import Any, Callable, Dict, Optional, Tuple
from fastapi import HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import Session as DBSession, select

from app.models import Session, SessionReport
from app.reports.config import ReportSettings, get_report_settings
from app.reports.fallback import build_fallback_narrative
from app.reports.narrative import validate_narrative_data
from app.reports.prompt import build_system_instruction, build_user_prompt
from app.reports.providers.base import (
    BaseLLMProvider,
    LLMProviderError,
    LLMRateLimitedError,
    LLMTimeoutError,
)
from app.reports.providers.gemini import GeminiLLMProvider
from app.reports.providers.mock import MockLLMProvider
from app.reports.stats import compute_session_stats

logger = logging.getLogger("app.reports")

SUPPORTED_LANGUAGES = {"en", "fr", "ar"}

_locks_mutex = threading.Lock()
_report_locks: Dict[Tuple[int, str], threading.Lock] = {}


def get_report_lock(session_id: int, language: str) -> threading.Lock:
    with _locks_mutex:
        key = (session_id, language)
        if key not in _report_locks:
            _report_locks[key] = threading.Lock()
        return _report_locks[key]


def get_default_clock() -> datetime:
    return datetime.now(timezone.utc)


def generate_report(
    session_id: int,
    db: DBSession,
    language: str = "en",
    force: bool = False,
    clock: Callable[[], datetime] = get_default_clock,
    custom_provider: Optional[BaseLLMProvider] = None,
    custom_settings: Optional[ReportSettings] = None,
    sleep_fn: Optional[Callable[[float], None]] = None,
    clock_fn: Optional[Callable[[], float]] = None,
    jitter_fn: Optional[Callable[[], float]] = None,
) -> SessionReport:
    """
    Generates or retrieves a cached coaching report for a workout session.
    Protected by a per-(session_id, language) lock for concurrency.
    """
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid language '{language}'. Supported languages: {sorted(SUPPORTED_LANGUAGES)}",
        )

    lock = get_report_lock(session_id, language)
    with lock:
        # Expire any cached objects in DB session to read latest state
        db.expire_all()

        # 1. Load session from database
        statement = (
            select(Session)
            .where(Session.id == session_id)
            .options(selectinload(Session.sets).selectinload(Session.sets.property.mapper.class_.reps))
        )
        session_obj = db.exec(statement).first()
        if not session_obj:
            raise HTTPException(status_code=404, detail=f"Session with id {session_id} not found")

        now = clock()
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        # 2. Check cache
        existing_report = db.exec(
            select(SessionReport).where(
                SessionReport.session_id == session_id,
                SessionReport.language == language,
            )
        ).first()

        if existing_report:
            if not force:
                return existing_report

            # Rate limit rule for force=True: must be at least 10s after last generation
            created_at_utc = existing_report.created_at
            if created_at_utc.tzinfo is None:
                created_at_utc = created_at_utc.replace(tzinfo=timezone.utc)

            elapsed = (now - created_at_utc).total_seconds()
            if elapsed < 10.0:
                retry_after = max(1, math.ceil(10.0 - elapsed))
                raise HTTPException(
                    status_code=429,
                    detail="Too Many Requests. Please wait before forcing report regeneration.",
                    headers={"Retry-After": str(retry_after)},
                )

        # 3. Compute stats
        stats = compute_session_stats(session_obj)
        top_issue_rules = [item["rule"] for item in stats.get("top_issues", [])]

        # 4. Determine LLM provider & settings
        settings = custom_settings or get_report_settings()
        provider_name = settings.llm_provider
        model_name = settings.llm_model

        provider = custom_provider
        is_fallback = False
        fallback_reason: Optional[str] = None
        narrative_dict: Optional[Dict[str, Any]] = None

        if provider is None:
            if provider_name == "gemini":
                if not settings.gemini_api_key:
                    is_fallback = True
                    fallback_reason = "no_api_key"
                else:
                    gemini_kwargs: Dict[str, Any] = {
                        "api_key": settings.gemini_api_key,
                        "model": model_name,
                        "fallback_models": settings.llm_fallback_models,
                        "timeout_seconds": settings.llm_timeout_seconds,
                    }
                    if sleep_fn is not None:
                        gemini_kwargs["sleep_fn"] = sleep_fn
                    if clock_fn is not None:
                        gemini_kwargs["clock_fn"] = clock_fn
                    if jitter_fn is not None:
                        gemini_kwargs["jitter_fn"] = jitter_fn

                    provider = GeminiLLMProvider(**gemini_kwargs)
            else:
                provider = MockLLMProvider()

        # 5. Call provider if not already marked fallback
        gen_start = time.perf_counter()
        attempts = 1

        if not is_fallback and provider is not None:
            system = build_system_instruction(language)
            prompt = build_user_prompt(stats, language)

            try:
                raw_response = provider.generate(
                    system=system,
                    prompt=prompt,
                    language=language,
                    stats=stats,
                )
                narrative = validate_narrative_data(raw_response, top_issue_rules)
                narrative_dict = narrative.model_dump()
                is_fallback = False
                fallback_reason = None
            except LLMTimeoutError:
                is_fallback = True
                fallback_reason = "timeout"
            except LLMRateLimitedError:
                is_fallback = True
                fallback_reason = "rate_limited"
            except LLMProviderError:
                is_fallback = True
                fallback_reason = "provider_error"
            except Exception:
                is_fallback = True
                fallback_reason = "invalid_output"

        # Read actual model and attempts used by provider if available
        if provider is not None:
            model_name = getattr(provider, "last_model_used", model_name)
            attempts = getattr(provider, "last_attempts", 1)

        latency = max(0.0, time.perf_counter() - gen_start)
        outcome = fallback_reason if is_fallback else "success"

        # Log one INFO line per generation: model, attempts, latency, outcome (never keys, prompts, or answers)
        logger.info(
            "Coaching report generation: model=%s attempts=%d latency=%.3fs outcome=%s",
            model_name,
            attempts,
            latency,
            outcome,
        )

        # 6. Apply fallback if needed
        if is_fallback or narrative_dict is None:
            fallback_narrative = build_fallback_narrative(stats, language)
            narrative_dict = fallback_narrative.model_dump()

        # 7. Persist report in database
        if existing_report:
            existing_report.provider = provider_name
            existing_report.model = model_name
            existing_report.stats = stats
            existing_report.narrative = narrative_dict
            existing_report.is_fallback = is_fallback
            existing_report.fallback_reason = fallback_reason
            existing_report.created_at = now
            db.add(existing_report)
            db.commit()
            db.refresh(existing_report)
            return existing_report
        else:
            new_report = SessionReport(
                session_id=session_id,
                language=language,
                provider=provider_name,
                model=model_name,
                stats=stats,
                narrative=narrative_dict,
                is_fallback=is_fallback,
                fallback_reason=fallback_reason,
                created_at=now,
            )
            db.add(new_report)
            db.commit()
            db.refresh(new_report)
            return new_report
