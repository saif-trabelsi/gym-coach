from datetime import datetime, timezone
import json
import math
from typing import Annotated, Any, Dict, List, Literal, Optional
from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
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


class RepReplayData(BaseModel):
    version: int = Field(..., description="Replay schema version, must be 1")
    fps: int = Field(..., ge=5, le=30, description="Framerate, 5 to 30 fps")
    aspect: float = Field(..., ge=0.2, le=5.0, description="Aspect ratio width / height, 0.2 to 5.0")
    mirrored: bool = Field(..., description="Whether video was mirrored")
    frames: List[Any] = Field(..., min_length=2, max_length=150, description="List of 2 to 150 frames")
    highlight: List[int] = Field(default_factory=list, description="Unique landmark indices to highlight (0-32)")
    violations: List[str] = Field(default_factory=list, max_length=10, description="Violations list (up to 10)")

    @field_validator("version")
    @classmethod
    def validate_version(cls, v: int) -> int:
        if v != 1:
            raise ValueError("Replay version must be 1")
        return v

    @field_validator("highlight")
    @classmethod
    def validate_highlight(cls, v: List[int]) -> List[int]:
        if len(v) > 33:
            raise ValueError("Highlight list cannot have more than 33 elements")
        if len(set(v)) != len(v):
            raise ValueError("Highlight list must contain unique landmark indices")
        for idx in v:
            if not isinstance(idx, int) or isinstance(idx, bool) or idx < 0 or idx > 32:
                raise ValueError("Highlight index must be an integer between 0 and 32")
        return v

    @field_validator("violations")
    @classmethod
    def validate_violations(cls, v: List[str]) -> List[str]:
        if len(v) > 10:
            raise ValueError("Violations list cannot have more than 10 items")
        for item in v:
            if not isinstance(item, str) or len(item) > 40:
                raise ValueError("Violation string cannot exceed 40 characters")
        return v

    @field_validator("frames")
    @classmethod
    def validate_frames(cls, v: List[Any]) -> List[Any]:
        if len(v) < 2 or len(v) > 150:
            raise ValueError("Frames list must contain between 2 and 150 frames")
        for f_idx, frame in enumerate(v):
            if not isinstance(frame, list) or len(frame) != 33:
                raise ValueError(f"Frame {f_idx} must have exactly 33 entries")
            for p_idx, pt in enumerate(frame):
                if pt is None:
                    continue
                if not isinstance(pt, (list, tuple)) or len(pt) != 2:
                    raise ValueError(f"Entry {p_idx} in frame {f_idx} must be null or a pair [x, y]")
                x, y = pt
                for coord_name, coord in (("x", x), ("y", y)):
                    if not isinstance(coord, (int, float)) or isinstance(coord, bool):
                        raise ValueError(
                            f"Coordinate {coord_name} in frame {f_idx} point {p_idx} must be a number, got {type(coord).__name__}"
                        )
                    if not math.isfinite(coord):
                        raise ValueError(f"Coordinate {coord_name} in frame {f_idx} point {p_idx} must be finite")
                    if coord < -0.5 or coord > 1.5:
                        raise ValueError(
                            f"Coordinate {coord_name} in frame {f_idx} point {p_idx} must be between -0.5 and 1.5, got {coord}"
                        )
        return v

    @model_validator(mode="after")
    def validate_serialized_size(self) -> "RepReplayData":
        serialized = json.dumps(self.model_dump()).encode("utf-8")
        if len(serialized) > 120_000:
            raise ValueError(f"Replay serialized JSON exceeds 120,000 bytes ({len(serialized)} bytes)")
        return self


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
    replay: Optional[RepReplayData] = Field(default=None, description="Optional skeleton animation replay data")

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
    has_replay: bool = Field(default=False, description="Whether this rep has stored replay animation data")


class WorkoutSetCreate(BaseModel):
    exercise: ExerciseType = Field(..., description="Exercise: squat or bicepCurl")
    started_at: UTCDateTime
    ended_at: UTCDateTime
    reps: List[RepCreate] = Field(..., min_length=1, description="List of reps")

    @model_validator(mode="after")
    def validate_set(self) -> "WorkoutSetCreate":
        if self.ended_at < self.started_at:
            raise ValueError("ended_at cannot be before started_at")
        replays_count = sum(1 for r in self.reps if r.replay is not None)
        if replays_count > 1:
            raise ValueError("More than one replay in the same set is not allowed")
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
    model_config = ConfigDict(from_attributes=True)

    session_id: int
    language: str
    created_at: UTCDateTime
    provider: str
    model: str
    is_fallback: bool
    fallback_reason: Optional[str] = None
    stats: Dict[str, Any]
    narrative: Dict[str, Any]


class ReportsCollectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    session_id: int
    reports: Dict[str, Optional[ReportRead]]

