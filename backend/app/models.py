from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import Column, DateTime, JSON, TypeDecorator
from sqlmodel import Field, Relationship, SQLModel


class UTCDateTime(TypeDecorator):
    """
    SQLAlchemy TypeDecorator that guarantees timezone-aware UTC datetime
    in Python even when stored in SQLite.
    """
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc)
        return value


class Session(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    started_at: datetime = Field(sa_column=Column(UTCDateTime, nullable=False))
    ended_at: datetime = Field(sa_column=Column(UTCDateTime, nullable=False))

    sets: List["WorkoutSet"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "passive_deletes": True,
        },
    )


class WorkoutSet(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="session.id", ondelete="CASCADE")
    exercise: str
    started_at: datetime = Field(sa_column=Column(UTCDateTime, nullable=False))
    ended_at: datetime = Field(sa_column=Column(UTCDateTime, nullable=False))

    session: Optional[Session] = Relationship(back_populates="sets")
    reps: List["Rep"] = Relationship(
        back_populates="workout_set",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "passive_deletes": True,
        },
    )


class Rep(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    set_id: int = Field(foreign_key="workoutset.id", ondelete="CASCADE")
    index: int
    score: int
    duration_ms: int
    metrics: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    violations: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    timestamp: int

    workout_set: Optional[WorkoutSet] = Relationship(back_populates="reps")
