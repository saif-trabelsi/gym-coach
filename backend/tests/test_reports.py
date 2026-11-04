from datetime import datetime, timedelta, timezone
import json
import logging
from typing import Any, Dict, List
from fastapi.testclient import TestClient
import httpx
import pytest
from sqlmodel import Session as DBSession, select

from app.main import app
from app.models import Rep, Session, SessionReport, WorkoutSet
from app.reports.config import ReportSettings, get_report_settings
from app.reports.fallback import build_fallback_narrative
from app.reports.narrative import Narrative, validate_narrative_data
from app.reports.prompt import build_system_instruction, build_user_prompt
from app.reports.providers.base import (
    BaseLLMProvider,
    LLMProviderError,
    LLMRateLimitedError,
    LLMTimeoutError,
)
from app.reports.providers.gemini import GeminiLLMProvider
from app.reports.providers.mock import MockLLMProvider
from app.reports.service import generate_report
from app.reports.stats import (
    compute_form_drop,
    compute_session_stats,
    compute_trend,
    compute_violation_ranking,
)
from app.routes.reports import get_clock


def create_sample_session(
    db: DBSession,
    sets_data: List[Dict[str, Any]],
    started_at: datetime = datetime(2026, 11, 4, 10, 0, 0, tzinfo=timezone.utc),
    ended_at: datetime = datetime(2026, 11, 4, 10, 30, 0, tzinfo=timezone.utc),
) -> Session:
    sess = Session(started_at=started_at, ended_at=ended_at)
    db.add(sess)
    db.commit()
    db.refresh(sess)

    for s_data in sets_data:
        w_set = WorkoutSet(
            session_id=sess.id,
            exercise=s_data.get("exercise", "squat"),
            started_at=started_at,
            ended_at=ended_at,
        )
        db.add(w_set)
        db.commit()
        db.refresh(w_set)

        for rep_idx, rep_info in enumerate(s_data.get("reps", []), 1):
            score = rep_info.get("score", 90)
            violations = rep_info.get("violations", [])
            rep = Rep(
                set_id=w_set.id,
                index=rep_idx,
                score=score,
                duration_ms=2000,
                metrics=rep_info.get("metrics", {}),
                violations=violations,
                timestamp=1793700000000 + rep_idx * 2000,
            )
            db.add(rep)

    db.commit()
    db.refresh(sess)
    return sess


# ---------------------------------------------------------------------------
# 1. Stats test
# ---------------------------------------------------------------------------
def test_1_squat_set_stats(db_session: DBSession):
    scores = [100, 100, 90, 80, 70, 60]
    reps = []
    for idx, s in enumerate(scores, 1):
        v = []
        if idx in (4, 5, 6):
            v.append("depth")
        if idx == 6:
            v.append("tempo")
        reps.append({"score": s, "violations": v})

    sess = create_sample_session(db_session, [{"exercise": "squat", "reps": reps}])
    stats = compute_session_stats(sess)

    set_stats = stats["sets"][0]
    assert set_stats["exercise"] == "squat"
    assert set_stats["reps"] == 6
    assert set_stats["average_score"] == 83.3
    assert set_stats["best"] == 100
    assert set_stats["worst"] == 60
    assert set_stats["form_drop"] == 35.0
    assert set_stats["trend"] == "declining"
    assert set_stats["violation_ranking"] == [
        {"rule": "depth", "count": 3},
        {"rule": "tempo", "count": 1},
    ]


# ---------------------------------------------------------------------------
# 2. Form drop and trend tests
# ---------------------------------------------------------------------------
def test_2_form_drop_and_trend_calculations():
    # 3 reps: drop is null, trend is "insufficient"
    assert compute_form_drop([90, 95, 80]) is None
    assert compute_trend(None) == "insufficient"

    # k values:
    # n=4: k=1 -> first [100], last [80] -> drop 20.0
    assert compute_form_drop([100, 90, 90, 80]) == 20.0

    # n=6: k=2 -> first [100, 90] (avg 95), last [80, 70] (avg 75) -> drop 20.0
    assert compute_form_drop([100, 90, 90, 90, 80, 70]) == 20.0

    # n=9: k=3 -> first [100, 100, 100] (avg 100), last [70, 70, 70] (avg 70) -> drop 30.0
    assert compute_form_drop([100, 100, 100, 90, 90, 90, 70, 70, 70]) == 30.0

    # Rising sequence [60,70,80,90,100,100] -> -35.0 and "improving"
    rising_drop = compute_form_drop([60, 70, 80, 90, 100, 100])
    assert rising_drop == -35.0
    assert compute_trend(rising_drop) == "improving"

    # Ties in ranking sorted alphabetically
    dummy_reps = [
        Rep(index=1, score=90, duration_ms=2000, timestamp=1793700000000, violations=["depth"]),
        Rep(index=2, score=90, duration_ms=2000, timestamp=1793700000000, violations=["back"]),
    ]
    ranking = compute_violation_ranking(dummy_reps)
    # Both count 1 -> back should come before depth alphabetically
    assert ranking == [
        {"rule": "back", "count": 1},
        {"rule": "depth", "count": 1},
    ]


# ---------------------------------------------------------------------------
# 3. top_issues across two sets
# ---------------------------------------------------------------------------
def test_3_top_issues_across_two_sets(db_session: DBSession):
    set1_reps = [
        {"score": 85, "violations": ["depth"]},
        {"score": 85, "violations": ["depth"]},
        {"score": 85, "violations": ["depth"]},
        {"score": 90, "violations": ["tempo"]},
    ]
    set2_reps = [
        {"score": 80, "violations": ["depth", "back"]},
        {"score": 80, "violations": ["depth", "back"]},
        {"score": 80, "violations": ["back"]},
        {"score": 80, "violations": ["back", "tempo"]},
    ]
    # Total reps = 8.
    # depth = 3 + 2 = 5
    # back = 4
    # tempo = 1 + 1 = 2
    # Top 2 issues: depth (5), back (4)
    # share: depth = 5/8 * 100 = 62.5%, back = 4/8 * 100 = 50.0%
    sess = create_sample_session(
        db_session,
        [
            {"exercise": "squat", "reps": set1_reps},
            {"exercise": "squat", "reps": set2_reps},
        ],
    )
    stats = compute_session_stats(sess)
    assert len(stats["top_issues"]) == 2
    assert stats["top_issues"][0] == {"rule": "depth", "count": 5, "share": 62.5}
    assert stats["top_issues"][1] == {"rule": "back", "count": 4, "share": 50.0}


# ---------------------------------------------------------------------------
# 4. Prompt: contains average score, rule descriptions, no IDs, no dates, unknown replaced by 'other'
# ---------------------------------------------------------------------------
def test_4_prompt_builder():
    sample_stats = {
        "total_reps": 10,
        "average_score": 88.5,
        "duration_minutes": 15.0,
        "exercises": ["squat"],
        "top_issues": [
            {"rule": "depth", "count": 3, "share": 30.0},
            {"rule": "weirdUnknownRule", "count": 2, "share": 20.0},
        ],
        "sets": [
            {
                "exercise": "squat",
                "reps": 10,
                "average_score": 88.5,
                "best": 95,
                "worst": 75,
                "form_drop": 10.0,
                "trend": "declining",
                "violation_ranking": [
                    {"rule": "depth", "count": 3},
                    {"rule": "weirdUnknownRule", "count": 2},
                ],
            }
        ],
    }

    prompt = build_user_prompt(sample_stats, "en")
    system = build_system_instruction("en")

    # Contains average score
    assert "88.5" in prompt
    # Contains known rule description
    assert "squat depth below parallel" in prompt
    # Unknown rule is replaced by 'other'
    assert "weirdUnknownRule" not in prompt
    assert "other" in prompt
    assert "other technique deviations" in prompt

    # Must contain NO session id, NO date or timestamp string, NO api key
    assert "session_id" not in prompt
    assert "2026-" not in prompt
    assert "AIza" not in prompt
    assert "AIza" not in system


# ---------------------------------------------------------------------------
# 5. Mock provider end to end
# ---------------------------------------------------------------------------
def test_5_mock_provider_end_to_end(client: TestClient, db_session: DBSession):
    sess = create_sample_session(
        db_session,
        [
            {
                "exercise": "squat",
                "reps": [{"score": 95, "violations": []}, {"score": 90, "violations": ["depth"]}],
            }
        ],
    )

    app.dependency_overrides[get_report_settings] = lambda: ReportSettings(
        llm_provider="mock",
        gemini_api_key=None,
        llm_model="mock-model",
        llm_timeout_seconds=20.0,
    )

    response = client.post(f"/sessions/{sess.id}/report?language=en")
    assert response.status_code == 200
    data = response.json()

    assert data["session_id"] == sess.id
    assert data["language"] == "en"
    assert data["provider"] == "mock"
    assert data["is_fallback"] is False
    assert data["fallback_reason"] is None

    # Verify narrative matches schema
    narrative = data["narrative"]
    assert "summary" in narrative
    assert len(narrative["strengths"]) in (1, 2)
    assert len(narrative["next_session"]) in (2, 3)
    assert "fatigue_note" in narrative


# ---------------------------------------------------------------------------
# 6. Caching and force=True with rate limit rule
# ---------------------------------------------------------------------------
def test_6_caching_and_rate_limiting(client: TestClient, db_session: DBSession):
    sess = create_sample_session(
        db_session,
        [{"exercise": "squat", "reps": [{"score": 90, "violations": []}]}],
    )

    mock_time = datetime(2026, 11, 4, 10, 0, 0, tzinfo=timezone.utc)
    app.dependency_overrides[get_clock] = lambda: (lambda: mock_time)
    app.dependency_overrides[get_report_settings] = lambda: ReportSettings(
        llm_provider="mock",
        gemini_api_key=None,
        llm_model="mock-model",
        llm_timeout_seconds=20.0,
    )

    # 1. First POST creates report
    res1 = client.post(f"/sessions/{sess.id}/report?language=en")
    assert res1.status_code == 200
    created_at_1 = res1.json()["created_at"]

    # 2. Second POST returns cached report with same timestamp
    res2 = client.post(f"/sessions/{sess.id}/report?language=en")
    assert res2.status_code == 200
    assert res2.json()["created_at"] == created_at_1

    # 3. force=true after 3 seconds returns 429 with Retry-After
    mock_time += timedelta(seconds=3)
    res_rate_limited = client.post(f"/sessions/{sess.id}/report?language=en&force=true")
    assert res_rate_limited.status_code == 429
    assert "Retry-After" in res_rate_limited.headers
    retry_after = int(res_rate_limited.headers["Retry-After"])
    assert retry_after >= 6

    # 4. force=true with clock advanced by 11 seconds succeeds and regenerates
    mock_time += timedelta(seconds=8)  # total 11s from initial creation
    res_forced = client.post(f"/sessions/{sess.id}/report?language=en&force=true")
    assert res_forced.status_code == 200
    assert res_forced.json()["created_at"] != created_at_1


# ---------------------------------------------------------------------------
# 7. Cache is per language: en and fr create two rows; GET 404 then 200
# ---------------------------------------------------------------------------
def test_7_cache_per_language(client: TestClient, db_session: DBSession):
    sess = create_sample_session(
        db_session,
        [{"exercise": "squat", "reps": [{"score": 90, "violations": []}]}],
    )

    app.dependency_overrides[get_report_settings] = lambda: ReportSettings(
        llm_provider="mock",
        gemini_api_key=None,
        llm_model="mock-model",
        llm_timeout_seconds=20.0,
    )

    # GET before generation returns 404
    get_res = client.get(f"/sessions/{sess.id}/report?language=en")
    assert get_res.status_code == 404

    # Create EN report
    post_en = client.post(f"/sessions/{sess.id}/report?language=en")
    assert post_en.status_code == 200

    # Create FR report
    post_fr = client.post(f"/sessions/{sess.id}/report?language=fr")
    assert post_fr.status_code == 200

    # Ensure two separate database rows exist
    reports_in_db = db_session.exec(
        select(SessionReport).where(SessionReport.session_id == sess.id)
    ).all()
    assert len(reports_in_db) == 2
    languages = {r.language for r in reports_in_db}
    assert languages == {"en", "fr"}

    # GET after generation returns 200
    get_after = client.get(f"/sessions/{sess.id}/report?language=en")
    assert get_after.status_code == 200
    assert get_after.json()["language"] == "en"


# ---------------------------------------------------------------------------
# 8. Validation and errors: language "de" -> 422, unknown session -> 404
# ---------------------------------------------------------------------------
def test_8_validation_and_errors(client: TestClient, db_session: DBSession):
    sess = create_sample_session(
        db_session,
        [{"exercise": "squat", "reps": [{"score": 90, "violations": []}]}],
    )

    # Invalid language gives 422
    assert client.post(f"/sessions/{sess.id}/report?language=de").status_code == 422
    assert client.get(f"/sessions/{sess.id}/report?language=de").status_code == 422

    # Unknown session gives 404
    assert client.post("/sessions/99999/report?language=en").status_code == 404
    assert client.get("/sessions/99999/report?language=en").status_code == 404


# ---------------------------------------------------------------------------
# 9. Gemini adapter with MockTransport: parsing, headers, retries on 429 and 500
# ---------------------------------------------------------------------------
def test_9_gemini_adapter_mock_transport():
    valid_gemini_json = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps({
                                "summary": "Great workout.",
                                "strengths": ["Strong form."],
                                "issues": [],
                                "next_session": ["Keep it up.", "Stay hydrated."],
                                "fatigue_note": "No fatigue observed.",
                            })
                        }
                    ]
                }
            }
        ]
    }

    request_history = []

    def mock_handler(request: httpx.Request) -> httpx.Response:
        request_history.append(request)
        # Verify API key is in header, not in URL and not in body
        assert request.headers.get("x-goog-api-key") == "secret-gemini-key"
        assert "secret-gemini-key" not in str(request.url)
        assert "secret-gemini-key" not in request.read().decode("utf-8")
        return httpx.Response(200, json=valid_gemini_json)

    transport = httpx.MockTransport(mock_handler)
    provider = GeminiLLMProvider(
        api_key="secret-gemini-key",
        transport=transport,
    )
    result = provider.generate("system prompt", "user prompt", "en")
    assert "Great workout." in result
    assert len(request_history) == 1

    # 429 followed by 200 succeeds after one retry
    call_count = 0

    def retry_handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return httpx.Response(429, json={"error": "Resource exhausted"})
        return httpx.Response(200, json=valid_gemini_json)

    retry_provider = GeminiLLMProvider(
        api_key="secret-gemini-key",
        transport=httpx.MockTransport(retry_handler),
    )
    retry_result = retry_provider.generate("system", "prompt", "en")
    assert "Great workout." in retry_result
    assert call_count == 2

    # Two consecutive 500 errors raise LLMProviderError
    def error_500_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "Internal server error"})

    failing_provider = GeminiLLMProvider(
        api_key="secret-gemini-key",
        transport=httpx.MockTransport(error_500_handler),
    )
    with pytest.raises(LLMProviderError):
        failing_provider.generate("system", "prompt", "en")


# ---------------------------------------------------------------------------
# 10. Fallbacks: right reason for each failure scenario
# ---------------------------------------------------------------------------
def test_10_fallbacks_reasons(db_session: DBSession):
    sess = create_sample_session(
        db_session,
        [{"exercise": "squat", "reps": [{"score": 80, "violations": ["depth"]}]}],
    )
    current_time = datetime(2026, 11, 4, 12, 0, 0, tzinfo=timezone.utc)

    def clock():
        nonlocal current_time
        current_time += timedelta(seconds=15)
        return current_time

    # 1. No API key
    rep1 = generate_report(
        session_id=sess.id,
        db=db_session,
        language="en",
        force=True,
        clock=clock,
        custom_settings=ReportSettings(
            llm_provider="gemini",
            gemini_api_key=None,
            llm_model="gemini",
            llm_timeout_seconds=20.0,
        ),
    )
    assert rep1.is_fallback is True
    assert rep1.fallback_reason == "no_api_key"

    # 2. Timeout
    class TimeoutProvider(BaseLLMProvider):
        def generate(self, system, prompt, language, stats=None):
            raise LLMTimeoutError("Timeout")

    rep2 = generate_report(
        session_id=sess.id,
        db=db_session,
        language="en",
        force=True,
        clock=clock,
        custom_provider=TimeoutProvider(),
    )
    assert rep2.is_fallback is True
    assert rep2.fallback_reason == "timeout"

    # 3. Rate limited (429 twice)
    class RateLimitedProvider(BaseLLMProvider):
        def generate(self, system, prompt, language, stats=None):
            raise LLMRateLimitedError("Rate limit exceeded")

    rep3 = generate_report(
        session_id=sess.id,
        db=db_session,
        language="en",
        force=True,
        clock=clock,
        custom_provider=RateLimitedProvider(),
    )
    assert rep3.is_fallback is True
    assert rep3.fallback_reason == "rate_limited"

    # 4. Provider error (500 twice)
    class ProviderErrorProvider(BaseLLMProvider):
        def generate(self, system, prompt, language, stats=None):
            raise LLMProviderError("Internal error")

    rep4 = generate_report(
        session_id=sess.id,
        db=db_session,
        language="en",
        force=True,
        clock=clock,
        custom_provider=ProviderErrorProvider(),
    )
    assert rep4.is_fallback is True
    assert rep4.fallback_reason == "provider_error"

    # 5. Response not JSON
    class NotJsonProvider(BaseLLMProvider):
        def generate(self, system, prompt, language, stats=None):
            return "<html>Not JSON</html>"

    rep5 = generate_report(
        session_id=sess.id,
        db=db_session,
        language="en",
        force=True,
        clock=clock,
        custom_provider=NotJsonProvider(),
    )
    assert rep5.is_fallback is True
    assert rep5.fallback_reason == "invalid_output"

    # 6. JSON violates schema (missing summary)
    class BadSchemaProvider(BaseLLMProvider):
        def generate(self, system, prompt, language, stats=None):
            return json.dumps({"strengths": ["Good"]})

    rep6 = generate_report(
        session_id=sess.id,
        db=db_session,
        language="en",
        force=True,
        clock=clock,
        custom_provider=BadSchemaProvider(),
    )
    assert rep6.is_fallback is True
    assert rep6.fallback_reason == "invalid_output"

    # 7. JSON whose issue rule is not in top_issues
    # (session only has 'depth', provider returns issue rule 'swing')
    class InventedRuleProvider(BaseLLMProvider):
        def generate(self, system, prompt, language, stats=None):
            return json.dumps({
                "summary": "Workout summary.",
                "strengths": ["Strong rep."],
                "issues": [{"rule": "swing", "explanation": "Swinging", "tip": "Don't swing"}],
                "next_session": ["Advice 1", "Advice 2"],
                "fatigue_note": "No fatigue.",
            })

    rep7 = generate_report(
        session_id=sess.id,
        db=db_session,
        language="en",
        force=True,
        clock=clock,
        custom_provider=InventedRuleProvider(),
    )
    assert rep7.is_fallback is True
    assert rep7.fallback_reason == "invalid_output"


# ---------------------------------------------------------------------------
# 11. Fallback content: EN, FR, AR exist, mention only rules in top_issues, zero violations -> 0 issues
# ---------------------------------------------------------------------------
def test_11_fallback_content_multilingual():
    clean_stats = {
        "total_reps": 10,
        "average_score": 95.0,
        "duration_minutes": 10.0,
        "exercises": ["squat"],
        "top_issues": [],
        "sets": [{"trend": "stable", "reps": 10}],
    }

    for lang in ("en", "fr", "ar"):
        narrative = build_fallback_narrative(clean_stats, lang)
        assert len(narrative.issues) == 0
        assert len(narrative.summary) > 0
        assert len(narrative.strengths) in (1, 2)
        assert len(narrative.next_session) in (2, 3)

    # Session with violations only mentions rules in top_issues
    stats_with_issues = {
        "total_reps": 10,
        "average_score": 75.0,
        "duration_minutes": 10.0,
        "exercises": ["squat"],
        "top_issues": [{"rule": "depth", "count": 3, "share": 30.0}],
        "sets": [{"trend": "declining", "reps": 10}],
    }

    for lang in ("en", "fr", "ar"):
        narrative = build_fallback_narrative(stats_with_issues, lang)
        assert len(narrative.issues) == 1
        assert narrative.issues[0].rule == "depth"
        # Validate that narrative passes Pydantic validation
        validated = validate_narrative_data(narrative.model_dump(), ["depth"])
        assert validated.issues[0].rule == "depth"


# ---------------------------------------------------------------------------
# 12. Deleting a session deletes its reports (cascade)
# ---------------------------------------------------------------------------
def test_12_cascade_delete_session_reports(client: TestClient, db_session: DBSession):
    sess = create_sample_session(
        db_session,
        [{"exercise": "squat", "reps": [{"score": 90, "violations": []}]}],
    )

    app.dependency_overrides[get_report_settings] = lambda: ReportSettings(
        llm_provider="mock",
        gemini_api_key=None,
        llm_model="mock-model",
        llm_timeout_seconds=20.0,
    )

    # Create report
    res_post = client.post(f"/sessions/{sess.id}/report?language=en")
    assert res_post.status_code == 200

    reports_before = db_session.exec(
        select(SessionReport).where(SessionReport.session_id == sess.id)
    ).all()
    assert len(reports_before) == 1

    # Delete session
    res_del = client.delete(f"/sessions/{sess.id}")
    assert res_del.status_code == 204

    # Reports must be deleted
    reports_after = db_session.exec(
        select(SessionReport).where(SessionReport.session_id == sess.id)
    ).all()
    assert len(reports_after) == 0


# ---------------------------------------------------------------------------
# 13. Security and privacy: key never in response body or logs; no prompt in logs
# ---------------------------------------------------------------------------
def test_13_privacy_key_and_prompt_not_leaked(
    client: TestClient,
    db_session: DBSession,
    caplog: pytest.LogCaptureFixture,
):
    SECRET_KEY = "super-secret-gemini-api-key-998877"
    sess = create_sample_session(
        db_session,
        [{"exercise": "squat", "reps": [{"score": 90, "violations": []}]}],
    )

    mock_response = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps({
                                "summary": "Private workout summary.",
                                "strengths": ["Consistency."],
                                "issues": [],
                                "next_session": ["Stretch.", "Hydrate."],
                                "fatigue_note": "Stable.",
                            })
                        }
                    ]
                }
            }
        ]
    }

    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=mock_response)

    app.dependency_overrides[get_report_settings] = lambda: ReportSettings(
        llm_provider="gemini",
        gemini_api_key=SECRET_KEY,
        llm_model="gemini-2.5-flash-lite",
        llm_timeout_seconds=20.0,
    )

    # Custom provider using mock transport
    gemini_provider = GeminiLLMProvider(
        api_key=SECRET_KEY,
        transport=httpx.MockTransport(mock_handler),
    )

    with caplog.at_level(logging.DEBUG):
        report = generate_report(
            session_id=sess.id,
            db=db_session,
            language="en",
            force=True,
            custom_provider=gemini_provider,
        )

    # Verify key does not appear in narrative or stats or report dict
    report_dict_str = json.dumps(report.narrative) + json.dumps(report.stats)
    assert SECRET_KEY not in report_dict_str

    # Verify logs do not leak the secret key or prompt
    for record in caplog.records:
        assert SECRET_KEY not in record.message
        assert "Workout Performance Analysis Data:" not in record.message
