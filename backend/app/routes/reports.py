from datetime import datetime, timezone
from typing import Callable, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import selectinload
from sqlmodel import Session as DBSession, select

from app.db import get_session
from app.models import Session, SessionReport
from app.reports.config import ReportSettings, get_report_settings
from app.reports.service import SUPPORTED_LANGUAGES, generate_report
from app.schemas import ReportRead

router = APIRouter(prefix="/sessions", tags=["reports"])


def get_clock() -> Callable[[], datetime]:
    return lambda: datetime.now(timezone.utc)


@router.post(
    "/{id}/report",
    response_model=ReportRead,
    status_code=status.HTTP_200_OK,
    summary="Generate or retrieve coaching report for a workout session",
)
def create_or_get_report(
    id: int,
    language: str = Query(default="en", description="Language code: en, fr, or ar"),
    force: bool = Query(default=False, description="Force regeneration bypassing cache"),
    db: DBSession = Depends(get_session),
    clock: Callable[[], datetime] = Depends(get_clock),
    settings: ReportSettings = Depends(get_report_settings),
):
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid language '{language}'. Supported: {sorted(SUPPORTED_LANGUAGES)}",
        )

    return generate_report(
        session_id=id,
        db=db,
        language=language,
        force=force,
        clock=clock,
        custom_settings=settings,
    )


@router.get(
    "/{id}/report",
    response_model=ReportRead,
    summary="Get cached coaching report for a workout session",
)
def get_cached_report(
    id: int,
    language: str = Query(default="en", description="Language code: en, fr, or ar"),
    db: DBSession = Depends(get_session),
):
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid language '{language}'. Supported: {sorted(SUPPORTED_LANGUAGES)}",
        )

    # Verify session exists
    session_obj = db.exec(select(Session).where(Session.id == id)).first()
    if not session_obj:
        raise HTTPException(status_code=404, detail=f"Session with id {id} not found")

    report = db.exec(
        select(SessionReport).where(
            SessionReport.session_id == id,
            SessionReport.language == language,
        )
    ).first()

    if not report:
        raise HTTPException(
            status_code=404,
            detail=f"Report for session {id} in language '{language}' not found",
        )

    return report
