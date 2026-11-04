import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
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

    return ReportSettings(
        llm_provider=provider,
        gemini_api_key=api_key,
        llm_model=model,
        llm_timeout_seconds=timeout,
    )
