from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session as DBSession, select

from app.db import get_session
from app.models import Rep, RepReplay

router = APIRouter(prefix="/reps", tags=["reps"])


@router.get("/{rep_id}/replay")
def get_rep_replay(
    rep_id: int,
    db: DBSession = Depends(get_session),
):
    rep = db.get(Rep, rep_id)
    if not rep:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rep with id {rep_id} not found",
        )

    statement = select(RepReplay).where(RepReplay.rep_id == rep_id)
    replay = db.exec(statement).first()
    if not replay:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rep with id {rep_id} has no replay",
        )

    return replay.data
