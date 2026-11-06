import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional
from dotenv import load_dotenv

# Load backend/.env if present
DOTENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=DOTENV_PATH)


@dataclass
class ReportSettings:
    llm_provider: str
    gemini_api_key: Optional[str]
    llm_model: str
    llm_timeout_seconds: float
    llm_fallback_models: List[str] = field(default_factory=list)


def get_report_settings() -> ReportSettings:
    api_key = os.getenv("GEMINI_API_KEY", "").strip() or None
    raw_provider = os.getenv("LLM_PROVIDER", "").strip().lower()

    # Default to "mock" when no API key is provided
    if raw_provider == "gemini" and api_key:
        provider = "gemini"
    else:
        provider = "mock"

    model = os.getenv("LLM_MODEL", "").strip() or "gemini-2.5-flash-lite"

    try:
        timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "20"))
    except ValueError:
        timeout = 20.0

    raw_fallbacks = os.getenv("LLM_FALLBACK_MODELS", "").strip()
    fallback_models = [m.strip() for m in raw_fallbacks.split(",") if m.strip()]

    return ReportSettings(
        llm_provider=provider,
        gemini_api_key=api_key,
        llm_model=model,
        llm_timeout_seconds=timeout,
        llm_fallback_models=fallback_models,
    )
