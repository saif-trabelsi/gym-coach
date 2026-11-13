from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session as DBSession, select

from app.db import get_session
from app.dependencies import get_device_id
from app.models import Rep, RepReplay, Session, WorkoutSet

router = APIRouter(prefix="/reps", tags=["reps"])


@router.get("/{rep_id}/replay")
def get_rep_replay(
    rep_id: int,
    device_id: str = Depends(get_device_id),
    db: DBSession = Depends(get_session),
):
    statement = (
        select(Rep)
        .join(WorkoutSet, Rep.set_id == WorkoutSet.id)
        .join(Session, WorkoutSet.session_id == Session.id)
        .where(Rep.id == rep_id, Session.device_id == device_id)
    )
    rep = db.exec(statement).first()
    if not rep:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rep with id {rep_id} not found",
        )

    replay_stmt = select(RepReplay).where(RepReplay.rep_id == rep_id)
    replay = db.exec(replay_stmt).first()
    if not replay:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rep with id {rep_id} has no replay",
        )

    return replay.data
