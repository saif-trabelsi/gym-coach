from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import selectinload
from sqlmodel import Session as DBSession, select

from app.db import get_session
from app.models import Session, WorkoutSet
from app.schemas import ProgressStatRead

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get(
    "/progress",
    response_model=List[ProgressStatRead],
    description="Get daily progress aggregated by exercise. Calendar days are determined by shifting each rep's timestamp by tz_offset_minutes.",
)
def get_progress_stats(
    exercise: Optional[str] = Query(default=None, description="Filter by exercise name"),
    tz_offset_minutes: int = Query(
        default=0,
        ge=-840,
        le=840,
        description="Timezone offset in minutes east of UTC (range -840 to 840, e.g. -300 for EST, +60 for CET) used to group reps into local calendar days.",
    ),
    db: DBSession = Depends(get_session),
):
    statement = (
        select(Session)
        .options(selectinload(Session.sets).selectinload(WorkoutSet.reps))
    )
    sessions = db.exec(statement).all()

    # Aggregate by (calendar_day_str, exercise)
    aggregated: Dict[Tuple[str, str], List[int]] = defaultdict(list)
    local_tz = timezone(timedelta(minutes=tz_offset_minutes))

    for sess in sessions:
        for w_set in sess.sets:
            if exercise is not None and w_set.exercise != exercise:
                continue

            for rep in w_set.reps:
                rep_dt = datetime.fromtimestamp(rep.timestamp / 1000.0, tz=local_tz)
                day_str = rep_dt.strftime("%Y-%m-%d")
                aggregated[(day_str, w_set.exercise)].append(rep.score)

    results: List[ProgressStatRead] = []
    # Sort by date ascending, then exercise
    sorted_items = sorted(aggregated.items(), key=lambda item: (item[0][0], item[0][1]))

    for (day_str, ex), scores in sorted_items:
        total_reps = len(scores)
        avg_score = round(sum(scores) / total_reps, 1) if total_reps > 0 else 0.0
        results.append(
            ProgressStatRead(
                date=day_str,
                exercise=ex,
                reps=total_reps,
                average_score=avg_score,
            )
        )

    return results
