from typing import List
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import selectinload
from sqlmodel import Session as DBSession, select

from app.db import get_session
from app.models import Rep, RepReplay, Session, WorkoutSet
from app.schemas import (
    RepRead,
    SessionCreate,
    SessionDetailRead,
    SessionSummaryRead,
    WorkoutSetRead,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])


def format_session_detail(session_obj: Session) -> SessionDetailRead:
    sets_sorted = sorted(session_obj.sets, key=lambda s: s.id or 0)
    formatted_sets = []
    for s in sets_sorted:
        reps_sorted = sorted(s.reps, key=lambda r: (r.index, r.id or 0))
        formatted_reps = [
            RepRead(
                id=r.id,
                set_id=r.set_id,
                index=r.index,
                score=r.score,
                duration_ms=r.duration_ms,
                metrics=r.metrics,
                violations=r.violations,
                timestamp=r.timestamp,
                has_replay=(r.replay is not None),
            )
            for r in reps_sorted
        ]
        formatted_sets.append(
            WorkoutSetRead(
                id=s.id,
                session_id=s.session_id,
                exercise=s.exercise,
                started_at=s.started_at,
                ended_at=s.ended_at,
                reps=formatted_reps,
            )
        )
    return SessionDetailRead(
        id=session_obj.id,
        started_at=session_obj.started_at,
        ended_at=session_obj.ended_at,
        sets=formatted_sets,
    )


@router.post("", response_model=SessionDetailRead, status_code=status.HTTP_201_CREATED)
def create_session(
    session_in: SessionCreate,
    db: DBSession = Depends(get_session),
):
    session_db = Session(
        started_at=session_in.started_at,
        ended_at=session_in.ended_at,
    )
    db.add(session_db)
    db.flush()

    for set_in in session_in.sets:
        set_db = WorkoutSet(
            session_id=session_db.id,
            exercise=set_in.exercise,
            started_at=set_in.started_at,
            ended_at=set_in.ended_at,
        )
        db.add(set_db)
        db.flush()

        for rep_in in set_in.reps:
            rep_db = Rep(
                set_id=set_db.id,
                index=rep_in.index,
                score=rep_in.score,
                duration_ms=rep_in.duration_ms,
                metrics=rep_in.metrics,
                violations=rep_in.violations,
                timestamp=rep_in.timestamp,
            )
            db.add(rep_db)
            db.flush()

            if rep_in.replay is not None:
                replay_db = RepReplay(
                    rep_id=rep_db.id,
                    data=rep_in.replay.model_dump(),
                )
                db.add(replay_db)

    db.commit()

    statement = (
        select(Session)
        .where(Session.id == session_db.id)
        .options(
            selectinload(Session.sets)
            .selectinload(WorkoutSet.reps)
            .selectinload(Rep.replay)
        )
    )
    created_session = db.exec(statement).one()
    return format_session_detail(created_session)


@router.get("", response_model=List[SessionSummaryRead])
def list_sessions(db: DBSession = Depends(get_session)):
    statement = (
        select(Session)
        .order_by(Session.started_at.desc(), Session.id.desc())
        .options(selectinload(Session.sets).selectinload(WorkoutSet.reps))
    )
    sessions = db.exec(statement).all()

    summaries = []
    for sess in sessions:
        seen = set()
        distinct_exercises = []
        for s in sorted(sess.sets, key=lambda s: s.id or 0):
            if s.exercise not in seen:
                seen.add(s.exercise)
                distinct_exercises.append(s.exercise)

        all_reps = [r for s in sess.sets for r in s.reps]
        total_reps = len(all_reps)
        avg_score = (
            round(sum(r.score for r in all_reps) / total_reps, 1)
            if total_reps > 0
            else None
        )
        summaries.append(
            SessionSummaryRead(
                id=sess.id,
                started_at=sess.started_at,
                ended_at=sess.ended_at,
                exercises=distinct_exercises,
                total_reps=total_reps,
                average_score=avg_score,
            )
        )
    return summaries


@router.get("/{session_id}", response_model=SessionDetailRead)
def get_session_detail(
    session_id: int,
    db: DBSession = Depends(get_session),
):
    statement = (
        select(Session)
        .where(Session.id == session_id)
        .options(
            selectinload(Session.sets)
            .selectinload(WorkoutSet.reps)
            .selectinload(Rep.replay)
        )
    )
    session_obj = db.exec(statement).first()
    if not session_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )
    return format_session_detail(session_obj)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    db: DBSession = Depends(get_session),
):
    statement = (
        select(Session)
        .where(Session.id == session_id)
        .options(
            selectinload(Session.sets)
            .selectinload(WorkoutSet.reps)
            .selectinload(Rep.replay)
        )
    )
    session_obj = db.exec(statement).first()
    if not session_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Session not found"
        )

    db.delete(session_obj)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
