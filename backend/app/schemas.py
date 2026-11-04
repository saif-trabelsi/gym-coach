from datetime import datetime, timezone
from typing import Annotated, Any, Dict, List, Literal, Optional
from pydantic import (
    BaseModel,
    BeforeValidator,
    Field,
    PlainSerializer,
    field_validator,
    model_validator,
)

ExerciseType = Literal["squat", "bicepCurl"]


def validate_utc_datetime(v: Any) -> datetime:
    if isinstance(v, str):
        try:
            dt = datetime.fromisoformat(v)
        except Exception as e:
            raise ValueError(f"Invalid datetime format: {e}")
    elif isinstance(v, datetime):
        dt = v
    else:
        raise ValueError("Invalid datetime format")

    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        raise ValueError("Timezone information is required (e.g. 'Z' or '+02:00')")

    return dt.astimezone(timezone.utc)


def serialize_utc_datetime(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    utc_dt = dt.astimezone(timezone.utc)
    return utc_dt.isoformat().replace("+00:00", "Z")


UTCDateTime = Annotated[
    datetime,
    BeforeValidator(validate_utc_datetime),
    PlainSerializer(serialize_utc_datetime, return_type=str),
]


class RepCreate(BaseModel):
    index: int = Field(..., ge=1, description="Position in the set, starting at 1")
    score: int = Field(..., ge=0, le=100, description="Score from 0 to 100")
    duration_ms: int = Field(..., ge=0, description="Duration in milliseconds")
    metrics: Dict[str, Any] = Field(default_factory=dict, description="Free-form metrics JSON")
    violations: List[str] = Field(default_factory=list, description="Rule IDs violated")
    timestamp: int = Field(
        ...,
        description="Unix epoch time in milliseconds (the value of JavaScript Date.now())",
        json_schema_extra={"example": 1793700130000},
    )

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp(cls, v: int) -> int:
        if v < 1_000_000_000_000:
            raise ValueError(
                "Timestamp must be Unix epoch time in milliseconds (the value of JavaScript Date.now()), "
                "values below 1000000000000 are rejected (likely seconds or performance.now())"
            )
        return v


class RepRead(BaseModel):
    id: int
    set_id: int
    index: int
    score: int
    duration_ms: int
    metrics: Dict[str, Any]
    violations: List[str]
    timestamp: int = Field(
        ...,
        description="Unix epoch time in milliseconds (the value of JavaScript Date.now())",
        json_schema_extra={"example": 1793700130000},
    )


class WorkoutSetCreate(BaseModel):
    exercise: ExerciseType = Field(..., description="Exercise: squat or bicepCurl")
    started_at: UTCDateTime
    ended_at: UTCDateTime
    reps: List[RepCreate] = Field(..., min_length=1, description="List of reps")

    @model_validator(mode="after")
    def validate_times(self) -> "WorkoutSetCreate":
        if self.ended_at < self.started_at:
            raise ValueError("ended_at cannot be before started_at")
        return self


class WorkoutSetRead(BaseModel):
    id: int
    session_id: int
    exercise: str
    started_at: UTCDateTime
    ended_at: UTCDateTime
    reps: List[RepRead]


class SessionCreate(BaseModel):
    started_at: UTCDateTime
    ended_at: UTCDateTime
    sets: List[WorkoutSetCreate] = Field(..., min_length=1, description="List of sets")

    @model_validator(mode="after")
    def validate_times(self) -> "SessionCreate":
        if self.ended_at < self.started_at:
            raise ValueError("ended_at cannot be before started_at")
        return self


class SessionDetailRead(BaseModel):
    id: int
    started_at: UTCDateTime
    ended_at: UTCDateTime
    sets: List[WorkoutSetRead]


class SessionSummaryRead(BaseModel):
    id: int
    started_at: UTCDateTime
    ended_at: UTCDateTime
    exercises: List[str]
    total_reps: int
    average_score: Optional[float]


class ProgressStatRead(BaseModel):
    date: str
    exercise: str
    reps: int
    average_score: float


class ReportRead(BaseModel):
    session_id: int
    language: str
    created_at: UTCDateTime
    provider: str
    model: str
    is_fallback: bool
    fallback_reason: Optional[str] = None
    stats: Dict[str, Any]
    narrative: Dict[str, Any]

