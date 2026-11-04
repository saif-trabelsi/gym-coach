import json
import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator

HTML_TAG_REGEX = re.compile(r"<[^>]+>")


def strip_html(text: str) -> str:
    if not isinstance(text, str):
        return text
    return HTML_TAG_REGEX.sub("", text).strip()


class NarrativeIssue(BaseModel):
    rule: str = Field(..., min_length=1)
    explanation: str = Field(..., min_length=1, max_length=250)
    tip: str = Field(..., min_length=1, max_length=250)

    @field_validator("rule", "explanation", "tip", mode="before")
    @classmethod
    def clean_text(cls, v: Any) -> str:
        return strip_html(str(v)) if v is not None else ""


class Narrative(BaseModel):
    summary: str = Field(..., min_length=1, max_length=400)
    strengths: List[str] = Field(..., min_length=1, max_length=2)
    issues: List[NarrativeIssue] = Field(default_factory=list, max_length=2)
    next_session: List[str] = Field(..., min_length=2, max_length=3)
    fatigue_note: str = Field(..., min_length=1, max_length=250)

    @field_validator("summary", "fatigue_note", mode="before")
    @classmethod
    def clean_string_fields(cls, v: Any) -> str:
        return strip_html(str(v)) if v is not None else ""

    @field_validator("strengths", mode="after")
    @classmethod
    def validate_strengths(cls, items: List[str]) -> List[str]:
        cleaned = [strip_html(it) for it in items]
        for it in cleaned:
            if len(it) > 200:
                raise ValueError(f"Strength text exceeds 200 characters: {it[:30]}...")
            if not it:
                raise ValueError("Strength text cannot be empty after stripping HTML")
        return cleaned

    @field_validator("next_session", mode="after")
    @classmethod
    def validate_next_session(cls, items: List[str]) -> List[str]:
        cleaned = [strip_html(it) for it in items]
        for it in cleaned:
            if len(it) > 200:
                raise ValueError(f"Next session advice exceeds 200 characters: {it[:30]}...")
            if not it:
                raise ValueError("Next session advice cannot be empty after stripping HTML")
        return cleaned


def validate_narrative_data(
    raw_input: Any,
    allowed_rules: List[str],
) -> Narrative:
    """
    Parses and validates a narrative against the Narrative schema and ensures every issue's
    rule exists in the backend's allowed_rules (top_issues rules).
    Raises ValueError on failure.
    """
    if isinstance(raw_input, str):
        try:
            data = json.loads(raw_input)
        except Exception as e:
            raise ValueError(f"Invalid JSON string: {e}")
    elif isinstance(raw_input, dict):
        data = raw_input
    else:
        raise ValueError("Narrative raw input must be a JSON string or dict")

    narrative = Narrative.model_validate(data)

    # Validate that every issue rule belongs to the session's top_issues rules
    allowed_set = set(allowed_rules)
    for issue in narrative.issues:
        if issue.rule not in allowed_set:
            raise ValueError(
                f"Narrative issue rule '{issue.rule}' is not present in session top_issues: {allowed_rules}"
            )

    return narrative
