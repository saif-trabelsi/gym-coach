import concurrent.futures
from datetime import datetime, timezone
import json
import logging
import pytest
from fastapi.testclient import TestClient
import httpx
from sqlmodel import Session as DBSession

from app.main import app
from app.models import Rep, Session, WorkoutSet
from app.reports.config import ReportSettings
from app.reports.providers.gemini import GeminiLLMProvider
from app.reports.service import generate_report


def create_sample_session(db: DBSession) -> Session:
    started = datetime(2026, 11, 4, 10, 0, 0, tzinfo=timezone.utc)
    ended = datetime(2026, 11, 4, 10, 30, 0, tzinfo=timezone.utc)
    sess = Session(started_at=started, ended_at=ended)
    db.add(sess)
    db.commit()
    db.refresh(sess)

    w_set = WorkoutSet(
        session_id=sess.id,
        exercise="squat",
        started_at=started,
        ended_at=ended,
    )
    db.add(w_set)
    db.commit()
    db.refresh(w_set)

    for i in range(1, 4):
        rep = Rep(
            set_id=w_set.id,
            index=i,
            score=80 + i * 5,
            duration_ms=2100,
            metrics={"minKneeAngle": 95},
            violations=["depth"] if i == 1 else [],
            timestamp=1793700130000 + i * 2000,
        )
        db.add(rep)
    db.commit()
    db.refresh(sess)
    return sess


def make_valid_gemini_json() -> str:
    narrative = {
        "summary": "Great workout session.",
        "strengths": ["Consistent tempo", "Good spine alignment"],
        "issues": [
            {
                "rule": "depth",
                "explanation": "Squat slightly higher on first rep",
                "tip": "Descend until hip crease is below top of knees.",
            }
        ],
        "next_session": ["Focus on depth from rep 1", "Keep chest tall"],
        "fatigue_note": "Slight fatigue in final rep.",
    }
    return json.dumps({
        "candidates": [
            {
                "content": {
                    "parts": [{"text": json.dumps(narrative)}]
                }
            }
        ]
    })


class SimulatedClock:
    def __init__(self, start: float = 0.0):
        self.current = start

    def now(self) -> float:
        return self.current

    def advance(self, seconds: float):
        self.current += seconds


# Test a: GET /sessions/{id}/reports
def test_get_sessions_reports_all_three_null_then_filled(db_session: DBSession, client: TestClient):
    sess = create_sample_session(db_session)

    # All three null before generation
    resp = client.get(f"/sessions/{sess.id}/reports")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session_id"] == sess.id
    assert data["reports"] == {"en": None, "fr": None, "ar": None}

    # Generate one report ("en")
    post_resp = client.post(f"/sessions/{sess.id}/report?language=en")
    assert post_resp.status_code == 200

    # GET reports: "en" is filled, others remain null
    resp2 = client.get(f"/sessions/{sess.id}/reports")
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["session_id"] == sess.id
    assert data2["reports"]["en"] is not None
    assert data2["reports"]["en"]["language"] == "en"
    assert data2["reports"]["fr"] is None
    assert data2["reports"]["ar"] is None

    # Unknown session gives 404
    resp_unknown = client.get("/sessions/999999/reports")
    assert resp_unknown.status_code == 404


# Test b: Provider answers 503, 503, then 200 (succeeds with 3 attempts, sleeps ~1s and 2s)
def test_provider_retries_503_then_200(db_session: DBSession):
    sess = create_sample_session(db_session)
    call_count = 0
    slept = []

    sim_clock = SimulatedClock(0.0)

    def fake_sleep(d: float):
        slept.append(d)
        sim_clock.advance(d)

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            return httpx.Response(503, json={"error": "Service unavailable"})
        return httpx.Response(200, text=make_valid_gemini_json())

    transport = httpx.MockTransport(handler)
    provider = GeminiLLMProvider(
        api_key="test-key",
        model="gemini-2.5-flash-lite",
        transport=transport,
        sleep_fn=fake_sleep,
        clock_fn=sim_clock.now,
        jitter_fn=lambda: 0.05,
    )

    report = generate_report(
        session_id=sess.id,
        db=db_session,
        language="en",
        custom_provider=provider,
    )

    assert report.is_fallback is False
    assert provider.last_attempts == 3
    assert len(slept) == 2
    # Sleep 1 ~ 1s (1.05s with jitter), Sleep 2 ~ 2s (2.05s with jitter)
    assert 0.95 <= slept[0] <= 1.15
    assert 1.95 <= slept[1] <= 2.15


# Test c: 429 three times -> fallback rate_limited after exactly 3 attempts
def test_provider_429_three_times_fallback_rate_limited(db_session: DBSession):
    sess = create_sample_session(db_session)
    call_count = 0
    slept = []
    sim_clock = SimulatedClock(0.0)

    def fake_sleep(d: float):
        slept.append(d)
        sim_clock.advance(d)

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(429, json={"error": "Rate limit exceeded"})

    transport = httpx.MockTransport(handler)
    provider = GeminiLLMProvider(
        api_key="test-key",
        model="gemini-2.5-flash-lite",
        transport=transport,
        sleep_fn=fake_sleep,
        clock_fn=sim_clock.now,
        jitter_fn=lambda: 0.0,
    )

    report = generate_report(
        session_id=sess.id,
        db=db_session,
        language="en",
        custom_provider=provider,
    )

    assert report.is_fallback is True
    assert report.fallback_reason == "rate_limited"
    assert provider.last_attempts == 3
    assert len(slept) == 2


# Test d: Timeouts on every attempt: fallback with reason timeout, budget respected
def test_provider_timeouts_budget_respected(db_session: DBSession):
    sess = create_sample_session(db_session)
    slept = []
    sim_clock = SimulatedClock(0.0)

    def fake_sleep(d: float):
        slept.append(d)
        sim_clock.advance(d)

    def handler(request: httpx.Request) -> httpx.Response:
        # Request timeout is capped by remaining budget; advance by request timeout (up to 10s)
        remaining = max(0.0, 25.0 - sim_clock.now())
        sim_clock.advance(min(10.0, remaining))
        raise httpx.TimeoutException("Read timeout")

    transport = httpx.MockTransport(handler)
    provider = GeminiLLMProvider(
        api_key="test-key",
        model="gemini-2.5-flash-lite",
        overall_budget_seconds=25.0,
        transport=transport,
        sleep_fn=fake_sleep,
        clock_fn=sim_clock.now,
        jitter_fn=lambda: 0.0,
    )

    report = generate_report(
        session_id=sess.id,
        db=db_session,
        language="en",
        custom_provider=provider,
    )

    assert report.is_fallback is True
    assert report.fallback_reason == "timeout"
    assert sim_clock.now() <= 26.0  # Within budget allowance


# Test e: Retry-After 2 is honored, Retry-After 30 is not waited for
def test_retry_after_honored_and_rejected(db_session: DBSession):
    sess = create_sample_session(db_session)

    # Case 1: Retry-After: 2 is honored
    slept1 = []
    calls1 = 0
    sim_clock1 = SimulatedClock(0.0)

    def handler1(request: httpx.Request) -> httpx.Response:
        nonlocal calls1
        calls1 += 1
        if calls1 == 1:
            return httpx.Response(429, headers={"Retry-After": "2"}, json={"error": "Wait"})
        return httpx.Response(200, text=make_valid_gemini_json())

    p1 = GeminiLLMProvider(
        api_key="test-key",
        transport=httpx.MockTransport(handler1),
        sleep_fn=lambda d: slept1.append(d),
        clock_fn=sim_clock1.now,
    )
    rep1 = generate_report(sess.id, db_session, language="en", force=True, custom_provider=p1)
    assert rep1.is_fallback is False
    assert slept1 == [2.0]

    # Case 2: Retry-After: 30 is not waited for
    slept2 = []
    sim_clock2 = SimulatedClock(0.0)

    def handler2(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, headers={"Retry-After": "30"}, json={"error": "Wait 30s"})

    p2 = GeminiLLMProvider(
        api_key="test-key",
        transport=httpx.MockTransport(handler2),
        sleep_fn=lambda d: slept2.append(d),
        clock_fn=sim_clock2.now,
    )
    clock_advance = [datetime(2026, 11, 4, 11, 0, 0, tzinfo=timezone.utc)]
    rep2 = generate_report(
        sess.id,
        db_session,
        language="fr",
        custom_provider=p2,
        clock=lambda: clock_advance[0],
    )
    assert rep2.is_fallback is True
    assert rep2.fallback_reason == "rate_limited"
    assert slept2 == []  # Never slept for 30s!


# Test f: LLM_FALLBACK_MODELS=modelB: primary 404 then modelB succeeds; both 404 fallback provider_error
def test_fallback_models_on_404(db_session: DBSession):
    sess = create_sample_session(db_session)

    # Case 1: primary 404, modelB 200 -> model field is modelB
    def handler_fallback(request: httpx.Request) -> httpx.Response:
        if "modelA" in str(request.url):
            return httpx.Response(404, json={"error": "Model not found"})
        if "modelB" in str(request.url):
            return httpx.Response(200, text=make_valid_gemini_json())
        return httpx.Response(500)

    p1 = GeminiLLMProvider(
        api_key="test-key",
        model="modelA",
        fallback_models=["modelB"],
        transport=httpx.MockTransport(handler_fallback),
    )
    rep1 = generate_report(sess.id, db_session, language="en", force=True, custom_provider=p1)
    assert rep1.is_fallback is False
    assert rep1.model == "modelB"

    # Case 2: both 404 -> fallback provider_error
    def handler_both_404(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "Model not found"})

    p2 = GeminiLLMProvider(
        api_key="test-key",
        model="modelA",
        fallback_models=["modelB"],
        transport=httpx.MockTransport(handler_both_404),
    )
    clock_advance = [datetime(2026, 11, 4, 12, 0, 0, tzinfo=timezone.utc)]
    rep2 = generate_report(
        sess.id,
        db_session,
        language="fr",
        custom_provider=p2,
        clock=lambda: clock_advance[0],
    )
    assert rep2.is_fallback is True
    assert rep2.fallback_reason == "provider_error"


# Test g: Two concurrent POSTs for same session and language: 1 provider call, identical responses
def test_concurrency_single_provider_call(db_session: DBSession):
    sess = create_sample_session(db_session)
    provider_call_count = 0

    class SlowMockProvider(GeminiLLMProvider):
        def __init__(self):
            pass

        def generate(self, system: str, prompt: str, language: str, stats=None) -> str:
            nonlocal provider_call_count
            import time
            provider_call_count += 1
            time.sleep(0.05)  # Simulate generation duration
            return json.dumps({
                "summary": "Concurrent test report",
                "strengths": ["Good form"],
                "issues": [],
                "next_session": ["Keep it up"],
                "fatigue_note": "None",
            })

    provider = SlowMockProvider()
    bind_engine = db_session.get_bind()

    def make_post():
        with DBSession(bind_engine) as db_thread:
            return generate_report(
                session_id=sess.id,
                db=db_thread,
                language="ar",
                custom_provider=provider,
            )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(make_post)
        f2 = executor.submit(make_post)
        r1 = f1.result()
        r2 = f2.result()

    assert provider_call_count == 1
    assert r1.id == r2.id
    assert r1.narrative == r2.narrative


# Test h: The API key never appears in logs or responses
def test_api_key_never_appears_in_logs_or_responses(db_session: DBSession, caplog: pytest.LogCaptureFixture):
    sess = create_sample_session(db_session)
    secret_key = "AQ.mySuperSecretKey123456789"

    def handler(request: httpx.Request) -> httpx.Response:
        # Primary fails with 500
        return httpx.Response(500, json={"error": "Internal server error"})

    provider = GeminiLLMProvider(
        api_key=secret_key,
        model="gemini-2.5-flash-lite",
        transport=httpx.MockTransport(handler),
        sleep_fn=lambda _: None,
    )

    with caplog.at_level(logging.INFO):
        report = generate_report(
            session_id=sess.id,
            db=db_session,
            language="en",
            force=True,
            custom_provider=provider,
        )

    # Check that secret_key does NOT appear in report or narrative
    report_dict_str = json.dumps(report.model_dump(), default=str)
    assert secret_key not in report_dict_str

    # Check all logs captured
    for record in caplog.records:
        assert secret_key not in record.getMessage()

