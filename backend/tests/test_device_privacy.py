from datetime import datetime, timezone
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlmodel import Session as DBSession

from app.db import migrate_db
from app.main import app
from app.models import Session, WorkoutSet, Rep, RepReplay, SessionReport
from app.reports.config import ReportSettings, get_report_settings
from app.routes.reports import get_clock


DEVICE_A = "11111111-1111-4111-8111-111111111111"
DEVICE_B = "22222222-2222-4222-8222-222222222222"
DEVICE_C = "33333333-3333-4333-8333-333333333333"


def sample_session_payload():
    return {
        "started_at": "2026-11-04T10:00:00Z",
        "ended_at": "2026-11-04T10:15:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-04T10:00:00Z",
                "ended_at": "2026-11-04T10:05:00Z",
                "reps": [
                    {
                        "index": 1,
                        "score": 92,
                        "duration_ms": 2200,
                        "metrics": {"minKneeAngle": 88},
                        "violations": [],
                        "timestamp": 1793700000000,
                        "replay": {
                            "version": 1,
                            "fps": 15,
                            "aspect": 1.333,
                            "mirrored": False,
                            "frames": [
                                [[0.5, 0.5]] * 33,
                                [[0.5, 0.6]] * 33,
                            ],
                            "highlight": [24, 26, 28],
                            "violations": [],
                        },
                    }
                ],
            }
        ],
    }


def test_missing_and_invalid_device_id_header(client: TestClient):
    # Test with no header at all
    raw_client = TestClient(app)
    resp = raw_client.get("/sessions")
    assert resp.status_code == 400
    assert "Missing X-Device-Id header" in resp.json()["detail"]

    # Test with invalid format (not UUID v4)
    resp = raw_client.get("/sessions", headers={"X-Device-Id": "invalid-uuid-token"})
    assert resp.status_code == 400
    assert "Invalid X-Device-Id header" in resp.json()["detail"]

    resp = raw_client.get("/sessions", headers={"X-Device-Id": "123456"})
    assert resp.status_code == 400


def test_device_isolation_sessions_and_stats(client: TestClient):
    raw_client = TestClient(app)

    # 1. Device A creates a session
    res_a = raw_client.post(
        "/sessions",
        json=sample_session_payload(),
        headers={"X-Device-Id": DEVICE_A},
    )
    assert res_a.status_code == 201
    session_a = res_a.json()
    session_id = session_a["id"]
    rep_id = session_a["sets"][0]["reps"][0]["id"]

    # 2. Device A can read its session
    get_a = raw_client.get(f"/sessions/{session_id}", headers={"X-Device-Id": DEVICE_A})
    assert get_a.status_code == 200

    # 3. Device B cannot see Device A's session in list
    list_b = raw_client.get("/sessions", headers={"X-Device-Id": DEVICE_B})
    assert list_b.status_code == 200
    assert len(list_b.json()) == 0

    # 4. Device B reading Device A's session answers 404 (never 403)
    get_b = raw_client.get(f"/sessions/{session_id}", headers={"X-Device-Id": DEVICE_B})
    assert get_b.status_code == 404
    assert get_b.status_code != 403

    # 5. Device B deleting Device A's session answers 404
    del_b = raw_client.delete(f"/sessions/{session_id}", headers={"X-Device-Id": DEVICE_B})
    assert del_b.status_code == 404

    # 6. Device B reading rep replay answers 404
    rep_b = raw_client.get(f"/reps/{rep_id}/replay", headers={"X-Device-Id": DEVICE_B})
    assert rep_b.status_code == 404

    # Device A can read its rep replay
    rep_a = raw_client.get(f"/reps/{rep_id}/replay", headers={"X-Device-Id": DEVICE_A})
    assert rep_a.status_code == 200

    # 7. Device B querying reports for Device A's session answers 404
    rep_post_b = raw_client.post(f"/sessions/{session_id}/report", headers={"X-Device-Id": DEVICE_B})
    assert rep_post_b.status_code == 404

    rep_get_b = raw_client.get(f"/sessions/{session_id}/report?language=en", headers={"X-Device-Id": DEVICE_B})
    assert rep_get_b.status_code == 404

    rep_all_b = raw_client.get(f"/sessions/{session_id}/reports", headers={"X-Device-Id": DEVICE_B})
    assert rep_all_b.status_code == 404

    # 8. Device B progress stats do not include Device A's reps
    stats_b = raw_client.get("/stats/progress", headers={"X-Device-Id": DEVICE_B})
    assert stats_b.status_code == 200
    assert len(stats_b.json()) == 0

    stats_a = raw_client.get("/stats/progress", headers={"X-Device-Id": DEVICE_A})
    assert stats_a.status_code == 200
    assert len(stats_a.json()) == 1


def test_safe_startup_migration():
    # Create SQLite DB with OLD schema (no device_id column)
    old_engine = create_engine("sqlite:///:memory:")
    with old_engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE session (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at DATETIME NOT NULL,
                    ended_at DATETIME NOT NULL
                )
                """
            )
        )
        # Insert an old session record
        conn.execute(
            text(
                "INSERT INTO session (started_at, ended_at) VALUES ('2026-11-04 10:00:00', '2026-11-04 10:15:00')"
            )
        )

    # Verify column does not exist before migration
    with old_engine.connect() as conn:
        cols_before = [row[1] for row in conn.execute(text("PRAGMA table_info(session)")).fetchall()]
        assert "device_id" not in cols_before

    # Run migration
    migrate_db(old_engine)

    # Verify column exists and has default 'legacy'
    with old_engine.connect() as conn:
        cols_after = [row[1] for row in conn.execute(text("PRAGMA table_info(session)")).fetchall()]
        assert "device_id" in cols_after

        # Verify old record is intact and has 'legacy' as device_id
        row = conn.execute(text("SELECT id, device_id, started_at FROM session WHERE id = 1")).fetchone()
        assert row is not None
        assert row[0] == 1
        assert row[1] == "legacy"


def test_device_export_and_delete(client: TestClient):
    raw_client = TestClient(app)

    # Create 2 sessions for Device A
    res1 = raw_client.post("/sessions", json=sample_session_payload(), headers={"X-Device-Id": DEVICE_A})
    assert res1.status_code == 201
    res2 = raw_client.post("/sessions", json=sample_session_payload(), headers={"X-Device-Id": DEVICE_A})
    assert res2.status_code == 201

    # Device export
    export_res = raw_client.get("/device/export", headers={"X-Device-Id": DEVICE_A})
    assert export_res.status_code == 200
    data = export_res.json()
    assert data["device_id"] == DEVICE_A
    assert data["total_sessions"] == 2
    assert len(data["sessions"]) == 2

    # Delete device data
    del_res = raw_client.delete("/device", headers={"X-Device-Id": DEVICE_A})
    assert del_res.status_code == 204

    # Subsequent list is empty
    list_res = raw_client.get("/sessions", headers={"X-Device-Id": DEVICE_A})
    assert list_res.status_code == 200
    assert len(list_res.json()) == 0


def test_quotas_against_llm_spending(client: TestClient):
    raw_client = TestClient(app)

    # Create session for Device A
    res = raw_client.post("/sessions", json=sample_session_payload(), headers={"X-Device-Id": DEVICE_A})
    session_id = res.json()["id"]

    # Configure per-device cap = 1, global cap = 100
    app.dependency_overrides[get_report_settings] = lambda: ReportSettings(
        llm_provider="mock",
        gemini_api_key=None,
        llm_model="mock-model",
        llm_timeout_seconds=20.0,
        report_daily_device_cap=1,
        report_daily_global_cap=100,
    )

    day1 = datetime(2026, 11, 4, 10, 0, 0, tzinfo=timezone.utc)
    current_time = day1
    app.dependency_overrides[get_clock] = lambda: (lambda: current_time)

    # 1st report generation succeeds
    rep1 = raw_client.post(f"/sessions/{session_id}/report?language=en", headers={"X-Device-Id": DEVICE_A})
    assert rep1.status_code == 200
    assert rep1.json()["is_fallback"] is False

    # 2nd report generation exceeds device quota
    # Wait 11 seconds to satisfy force cooldown
    current_time = datetime(2026, 11, 4, 10, 0, 15, tzinfo=timezone.utc)
    rep2 = raw_client.post(f"/sessions/{session_id}/report?language=fr&force=true", headers={"X-Device-Id": DEVICE_A})
    assert rep2.status_code == 200
    assert rep2.json()["is_fallback"] is True
    assert rep2.json()["fallback_reason"] == "quota_exceeded"

    # Advance clock to next day (day 2) -> quota resets
    current_time = datetime(2026, 11, 5, 10, 0, 0, tzinfo=timezone.utc)
    rep3 = raw_client.post(f"/sessions/{session_id}/report?language=ar&force=true", headers={"X-Device-Id": DEVICE_A})
    assert rep3.status_code == 200
    assert rep3.json()["is_fallback"] is False


def test_cors_preflight_allows_device_header(client: TestClient):
    raw_client = TestClient(app)
    resp = raw_client.options(
        "/sessions",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "x-device-id, content-type",
        },
    )
    assert resp.status_code == 200
    allow_origin = resp.headers.get("access-control-allow-origin")
    assert allow_origin == "http://localhost:5173"
    allow_headers = resp.headers.get("access-control-allow-headers", "")
    assert "x-device-id" in allow_headers.lower() or "*" in allow_headers
