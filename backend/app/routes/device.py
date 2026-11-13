from datetime import datetime, timezone
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import selectinload
from sqlmodel import Session as DBSession, select

from app.db import get_session
from app.dependencies import get_device_id
from app.models import Rep, Session, SessionReport, WorkoutSet
from app.routes.sessions import format_session_detail
from app.schemas import ReportRead

router = APIRouter(prefix="/device", tags=["device"])


@router.get("/export")
def export_device_data(
    device_id: str = Depends(get_device_id),
    db: DBSession = Depends(get_session),
) -> Dict[str, Any]:
    """
    Exports all workout sessions, sets, reps, and coaching reports for this device.
    """
    statement = (
        select(Session)
        .where(Session.device_id == device_id)
        .order_by(Session.started_at.asc())
        .options(
            selectinload(Session.sets)
            .selectinload(WorkoutSet.reps)
            .selectinload(Rep.replay),
            selectinload(Session.reports),
        )
    )
    sessions = db.exec(statement).all()

    export_sessions: List[Dict[str, Any]] = []
    for sess in sessions:
        sess_data = format_session_detail(sess).model_dump()
        # Include cached reports
        sess_data["reports"] = [
            ReportRead.model_validate(r).model_dump() for r in sess.reports
        ]
        export_sessions.append(sess_data)

    return {
        "device_id": device_id,
        "exported_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "total_sessions": len(export_sessions),
        "sessions": export_sessions,
    }


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_device_data(
    device_id: str = Depends(get_device_id),
    db: DBSession = Depends(get_session),
) -> Response:
    """
    Permanently deletes all data associated with this device.
    """
    statement = select(Session).where(Session.device_id == device_id)
    sessions = db.exec(statement).all()
    for sess in sessions:
        db.delete(sess)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
