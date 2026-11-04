from collections import defaultdict
from math import floor
from typing import Any, Dict, List, Optional
from app.models import Rep, Session, WorkoutSet

FATIGUE_BAND = 5.0


def compute_form_drop(scores: List[int | float]) -> Optional[float]:
    """
    k = max(1, floor(n/3))
    returns average of first k scores minus average of last k scores,
    rounded to 1 decimal place. None if n < 4.
    """
    n = len(scores)
    if n < 4:
        return None

    k = max(1, floor(n / 3))
    first_k = scores[:k]
    last_k = scores[-k:]

    avg_first = sum(first_k) / k
    avg_last = sum(last_k) / k
    return round(avg_first - avg_last, 1)


def compute_trend(form_drop: Optional[float]) -> str:
    """
    "declining" if form_drop >= FATIGUE_BAND
    "improving" if form_drop <= -FATIGUE_BAND
    "stable" otherwise
    "insufficient" if form_drop is None
    """
    if form_drop is None:
        return "insufficient"
    if form_drop >= FATIGUE_BAND:
        return "declining"
    if form_drop <= -FATIGUE_BAND:
        return "improving"
    return "stable"


def compute_violation_ranking(reps: List[Rep]) -> List[Dict[str, Any]]:
    """
    Counts each violation rule across reps.
    Returns list of {"rule": rule, "count": count} sorted by count descending then rule name ascending.
    """
    counts: Dict[str, int] = defaultdict(int)
    for r in reps:
        if r.violations:
            for v in r.violations:
                if v:
                    counts[v] += 1

    sorted_items = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return [{"rule": rule, "count": count} for rule, count in sorted_items]


def compute_session_stats(session: Session) -> Dict[str, Any]:
    """
    Pure function computing set-level and session-level stats from a Session object.
    """
    all_reps: List[Rep] = []
    sets_stats: List[Dict[str, Any]] = []
    rule_totals: Dict[str, int] = defaultdict(int)

    for w_set in session.sets:
        all_reps.extend(w_set.reps)
        scores = [r.score for r in w_set.reps]
        reps_count = len(scores)

        if reps_count > 0:
            avg_score = round(sum(scores) / reps_count, 1)
            best_score = max(scores)
            worst_score = min(scores)
        else:
            avg_score = 0.0
            best_score = 0
            worst_score = 0

        form_drop = compute_form_drop(scores)
        trend = compute_trend(form_drop)
        ranking = compute_violation_ranking(w_set.reps)

        for item in ranking:
            rule_totals[item["rule"]] += item["count"]

        sets_stats.append({
            "exercise": w_set.exercise,
            "reps": reps_count,
            "average_score": avg_score,
            "best": best_score,
            "worst": worst_score,
            "form_drop": form_drop,
            "trend": trend,
            "violation_ranking": ranking,
        })

    total_reps = len(all_reps)
    if total_reps > 0:
        session_avg = round(sum(r.score for r in all_reps) / total_reps, 1)
    else:
        session_avg = 0.0

    duration_minutes = round(
        abs((session.ended_at - session.started_at).total_seconds()) / 60.0, 1
    )
    exercises = list(dict.fromkeys(s.exercise for s in session.sets))

    # top_issues: up to 2 rules with highest total counts across session
    sorted_rules = sorted(rule_totals.items(), key=lambda item: (-item[1], item[0]))
    top_issues: List[Dict[str, Any]] = []
    for rule, count in sorted_rules[:2]:
        share = round((count / total_reps) * 100, 1) if total_reps > 0 else 0.0
        top_issues.append({
            "rule": rule,
            "count": count,
            "share": share,
        })

    return {
        "total_reps": total_reps,
        "average_score": session_avg,
        "duration_minutes": duration_minutes,
        "exercises": exercises,
        "top_issues": top_issues,
        "sets": sets_stats,
    }
