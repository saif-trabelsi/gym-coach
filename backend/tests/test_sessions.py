from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlmodel import Session as DBSession, select
from app.models import Rep


def test_post_and_get_session_nested_detail(client: TestClient):
    payload = {
        "started_at": "2026-11-03T10:00:00Z",
        "ended_at": "2026-11-03T10:15:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-03T10:00:30Z",
                "ended_at": "2026-11-03T10:05:00Z",
                "reps": [
                    {
                        "index": 1,
                        "score": 95,
                        "duration_ms": 2100,
                        "metrics": {"minKneeAngle": 82.1, "torsoLean": 22.4},
                        "violations": [],
                        "timestamp": 1793700032000,
                    },
                    {
                        "index": 2,
                        "score": 85,
                        "duration_ms": 2200,
                        "metrics": {"minKneeAngle": 84.5, "torsoLean": 26.1},
                        "violations": ["tempo"],
                        "timestamp": 1793700035000,
                    },
                    {
                        "index": 3,
                        "score": 100,
                        "duration_ms": 2000,
                        "metrics": {"minKneeAngle": 79.0, "torsoLean": 18.0},
                        "violations": [],
                        "timestamp": 1793700038000,
                    },
                ],
            },
            {
                "exercise": "bicepCurl",
                "started_at": "2026-11-03T10:06:00Z",
                "ended_at": "2026-11-03T10:10:00Z",
                "reps": [
                    {
                        "index": 1,
                        "score": 90,
                        "duration_ms": 1800,
                        "metrics": {"minElbowAngle": 48.0, "maxElbowAngle": 162.0},
                        "violations": [],
                        "timestamp": 1793700042000,
                    },
                    {
                        "index": 2,
                        "score": 75,
                        "duration_ms": 1700,
                        "metrics": {"minElbowAngle": 62.0, "maxElbowAngle": 160.0},
                        "violations": ["range"],
                        "timestamp": 1793700045000,
                    },
                ],
            },
        ],
    }

    # 1. POST session
    response = client.post("/sessions", json=payload)
    assert response.status_code == 201
    created = response.json()
    assert "id" in created
    assert created["id"] is not None
    assert len(created["sets"]) == 2

    set1 = created["sets"][0]
    set2 = created["sets"][1]
    assert set1["id"] is not None
    assert set1["exercise"] == "squat"
    assert len(set1["reps"]) == 3
    assert set1["reps"][0]["index"] == 1
    assert set1["reps"][1]["index"] == 2
    assert set1["reps"][2]["index"] == 3

    assert set2["id"] is not None
    assert set2["exercise"] == "bicepCurl"
    assert len(set2["reps"]) == 2
    assert set2["reps"][0]["index"] == 1
    assert set2["reps"][1]["index"] == 2

    # 2. GET /sessions/{id}
    session_id = created["id"]
    get_res = client.get(f"/sessions/{session_id}")
    assert get_res.status_code == 200
    detail = get_res.json()
    assert detail["id"] == session_id
    assert len(detail["sets"]) == 2
    assert detail["sets"][0]["exercise"] == "squat"
    assert len(detail["sets"][0]["reps"]) == 3
    assert detail["sets"][1]["exercise"] == "bicepCurl"
    assert len(detail["sets"][1]["reps"]) == 2


def test_get_sessions_list_ordering_and_summary(client: TestClient):
    # Session 1 (earlier) with scores 100, 80, 60 -> average 80.0, total reps = 3
    s1_payload = {
        "started_at": "2026-11-03T09:00:00Z",
        "ended_at": "2026-11-03T09:30:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-03T09:05:00Z",
                "ended_at": "2026-11-03T09:20:00Z",
                "reps": [
                    {"index": 1, "score": 100, "duration_ms": 2000, "timestamp": 1793700010000},
                    {"index": 2, "score": 80, "duration_ms": 2000, "timestamp": 1793700020000},
                    {"index": 3, "score": 60, "duration_ms": 2000, "timestamp": 1793700030000},
                ],
            }
        ],
    }

    # Session 2 (later) with bicepCurl
    s2_payload = {
        "started_at": "2026-11-03T11:00:00Z",
        "ended_at": "2026-11-03T11:30:00Z",
        "sets": [
            {
                "exercise": "bicepCurl",
                "started_at": "2026-11-03T11:05:00Z",
                "ended_at": "2026-11-03T11:20:00Z",
                "reps": [
                    {"index": 1, "score": 90, "duration_ms": 1500, "timestamp": 1793700040000},
                ],
            }
        ],
    }

    res1 = client.post("/sessions", json=s1_payload)
    assert res1.status_code == 201
    s1_id = res1.json()["id"]

    res2 = client.post("/sessions", json=s2_payload)
    assert res2.status_code == 201
    s2_id = res2.json()["id"]

    list_res = client.get("/sessions")
    assert list_res.status_code == 200
    sessions = list_res.json()
    assert len(sessions) == 2

    # Newest first: session 2 (started at 11:00) should be before session 1 (started at 09:00)
    assert sessions[0]["id"] == s2_id
    assert sessions[1]["id"] == s1_id

    # Verify session 1 summary stats
    s1_summary = sessions[1]
    assert s1_summary["total_reps"] == 3
    assert s1_summary["average_score"] == 80.0
    assert s1_summary["exercises"] == ["squat"]

    # Verify session 2 summary stats
    s2_summary = sessions[0]
    assert s2_summary["total_reps"] == 1
    assert s2_summary["average_score"] == 90.0
    assert s2_summary["exercises"] == ["bicepCurl"]


def test_session_average_score_calculation(client: TestClient):
    payload = {
        "started_at": "2026-11-03T08:00:00Z",
        "ended_at": "2026-11-03T08:20:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-03T08:05:00Z",
                "ended_at": "2026-11-03T08:15:00Z",
                "reps": [
                    {"index": 1, "score": 100, "duration_ms": 2000, "timestamp": 1793700010000},
                    {"index": 2, "score": 70, "duration_ms": 2000, "timestamp": 1793700020000},
                ],
            }
        ],
    }
    res = client.post("/sessions", json=payload)
    assert res.status_code == 201

    list_res = client.get("/sessions")
    assert list_res.status_code == 200
    sessions = list_res.json()
    assert len(sessions) == 1
    assert sessions[0]["total_reps"] == 2
    assert sessions[0]["average_score"] == 85.0


def test_validation_errors_return_422(client: TestClient):
    base_rep = {"index": 1, "score": 90, "duration_ms": 2000, "timestamp": 1793700010000}
    base_set = {
        "exercise": "squat",
        "started_at": "2026-11-03T10:00:00Z",
        "ended_at": "2026-11-03T10:10:00Z",
        "reps": [base_rep],
    }

    # 1. Score 150 (> 100)
    rep_high_score = dict(base_rep, score=150)
    set_high_score = dict(base_set, reps=[rep_high_score])
    res = client.post("/sessions", json={"started_at": "2026-11-03T10:00:00Z", "ended_at": "2026-11-03T10:15:00Z", "sets": [set_high_score]})
    assert res.status_code == 422

    # 2. Score -1 (< 0)
    rep_neg_score = dict(base_rep, score=-1)
    set_neg_score = dict(base_set, reps=[rep_neg_score])
    res = client.post("/sessions", json={"started_at": "2026-11-03T10:00:00Z", "ended_at": "2026-11-03T10:15:00Z", "sets": [set_neg_score]})
    assert res.status_code == 422

    # 3. Negative duration_ms
    rep_neg_dur = dict(base_rep, duration_ms=-500)
    set_neg_dur = dict(base_set, reps=[rep_neg_dur])
    res = client.post("/sessions", json={"started_at": "2026-11-03T10:00:00Z", "ended_at": "2026-11-03T10:15:00Z", "sets": [set_neg_dur]})
    assert res.status_code == 422

    # 4. Unknown exercise "deadlift"
    set_bad_ex = dict(base_set, exercise="deadlift")
    res = client.post("/sessions", json={"started_at": "2026-11-03T10:00:00Z", "ended_at": "2026-11-03T10:15:00Z", "sets": [set_bad_ex]})
    assert res.status_code == 422

    # 5. Set with empty reps
    set_empty_reps = dict(base_set, reps=[])
    res = client.post("/sessions", json={"started_at": "2026-11-03T10:00:00Z", "ended_at": "2026-11-03T10:15:00Z", "sets": [set_empty_reps]})
    assert res.status_code == 422

    # 6. Session with empty sets
    res = client.post("/sessions", json={"started_at": "2026-11-03T10:00:00Z", "ended_at": "2026-11-03T10:15:00Z", "sets": []})
    assert res.status_code == 422

    # 7. ended_at before started_at in session
    res = client.post("/sessions", json={"started_at": "2026-11-03T10:15:00Z", "ended_at": "2026-11-03T10:00:00Z", "sets": [base_set]})
    assert res.status_code == 422

    # 8. ended_at before started_at in set
    bad_time_set = dict(base_set, started_at="2026-11-03T10:10:00Z", ended_at="2026-11-03T10:05:00Z")
    res = client.post("/sessions", json={"started_at": "2026-11-03T10:00:00Z", "ended_at": "2026-11-03T10:15:00Z", "sets": [bad_time_set]})
    assert res.status_code == 422

    # 9. Rep index below 1 (index 0)
    rep_zero_idx = dict(base_rep, index=0)
    set_zero_idx = dict(base_set, reps=[rep_zero_idx])
    res = client.post("/sessions", json={"started_at": "2026-11-03T10:00:00Z", "ended_at": "2026-11-03T10:15:00Z", "sets": [set_zero_idx]})
    assert res.status_code == 422


def test_session_not_found_404(client: TestClient):
    get_res = client.get("/sessions/99999")
    assert get_res.status_code == 404

    del_res = client.delete("/sessions/99999")
    assert del_res.status_code == 404


def test_delete_session_and_cascade_reps(client: TestClient, db_session: DBSession):
    payload = {
        "started_at": "2026-11-03T12:00:00Z",
        "ended_at": "2026-11-03T12:20:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-03T12:05:00Z",
                "ended_at": "2026-11-03T12:15:00Z",
                "reps": [
                    {"index": 1, "score": 90, "duration_ms": 2000, "timestamp": 1793700010000},
                    {"index": 2, "score": 85, "duration_ms": 2100, "timestamp": 1793700020000},
                ],
            }
        ],
    }

    create_res = client.post("/sessions", json=payload)
    assert create_res.status_code == 201
    session_id = create_res.json()["id"]

    # Verify reps exist in DB
    reps_before = db_session.exec(select(Rep)).all()
    assert len(reps_before) == 2

    # DELETE session -> 204
    del_res = client.delete(f"/sessions/{session_id}")
    assert del_res.status_code == 204

    # GET session -> 404
    get_res = client.get(f"/sessions/{session_id}")
    assert get_res.status_code == 404

    # Reps no longer exist in DB (cascade delete)
    reps_after = db_session.exec(select(Rep)).all()
    assert len(reps_after) == 0


def test_metrics_json_round_trip(client: TestClient):
    sample_metrics = {"minKneeAngle": 72.5, "torsoLean": 18}
    payload = {
        "started_at": "2026-11-03T14:00:00Z",
        "ended_at": "2026-11-03T14:15:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-03T14:02:00Z",
                "ended_at": "2026-11-03T14:10:00Z",
                "reps": [
                    {
                        "index": 1,
                        "score": 100,
                        "duration_ms": 2500,
                        "metrics": sample_metrics,
                        "violations": [],
                        "timestamp": 1793700050000,
                    }
                ],
            }
        ],
    }
    create_res = client.post("/sessions", json=payload)
    assert create_res.status_code == 201
    session_id = create_res.json()["id"]

    get_res = client.get(f"/sessions/{session_id}")
    assert get_res.status_code == 200
    rep = get_res.json()["sets"][0]["reps"][0]
    assert rep["metrics"] == sample_metrics
    assert rep["metrics"]["minKneeAngle"] == 72.5
    assert rep["metrics"]["torsoLean"] == 18


def test_cors_preflight_headers(client: TestClient):
    # Allowed origin: http://localhost:5173
    res_allowed = client.options(
        "/sessions",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    assert res_allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"

    # Disallowed origin: http://evil.example
    res_disallowed = client.options(
        "/sessions",
        headers={
            "Origin": "http://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert "access-control-allow-origin" not in res_disallowed.headers


def test_health_endpoint(client: TestClient):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_rep_timestamp_validation(client: TestClient):
    base_session = {
        "started_at": "2026-11-03T10:00:00Z",
        "ended_at": "2026-11-03T10:15:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-03T10:00:30Z",
                "ended_at": "2026-11-03T10:05:00Z",
                "reps": [
                    {
                        "index": 1,
                        "score": 95,
                        "duration_ms": 2000,
                        "timestamp": 1793700130000,
                    }
                ],
            }
        ],
    }

    # 1. Valid epoch-ms timestamp (>= 1_000_000_000_000) -> 201 Created
    res_valid = client.post("/sessions", json=base_session)
    assert res_valid.status_code == 201

    # 2. Timestamp in seconds (1793700130 < 1_000_000_000_000) -> 422
    sec_payload = {
        "started_at": "2026-11-03T10:00:00Z",
        "ended_at": "2026-11-03T10:15:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-03T10:00:30Z",
                "ended_at": "2026-11-03T10:05:00Z",
                "reps": [
                    {
                        "index": 1,
                        "score": 95,
                        "duration_ms": 2000,
                        "timestamp": 1793700130,
                    }
                ],
            }
        ],
    }
    res_sec = client.post("/sessions", json=sec_payload)
    assert res_sec.status_code == 422
    assert "Unix epoch time in milliseconds" in res_sec.text or "1000000000000" in res_sec.text

    # 3. Timestamp from performance.now() (5234 < 1_000_000_000_000) -> 422
    perf_payload = {
        "started_at": "2026-11-03T10:00:00Z",
        "ended_at": "2026-11-03T10:15:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-03T10:00:30Z",
                "ended_at": "2026-11-03T10:05:00Z",
                "reps": [
                    {
                        "index": 1,
                        "score": 95,
                        "duration_ms": 2000,
                        "timestamp": 5234,
                    }
                ],
            }
        ],
    }
    res_perf = client.post("/sessions", json=perf_payload)
    assert res_perf.status_code == 422


def test_session_utc_datetime_handling(client: TestClient):
    # 1. POST with "2026-11-03T10:00:00Z" returns started_at ending in "Z", and GET returns same instant
    payload_z = {
        "started_at": "2026-11-03T10:00:00Z",
        "ended_at": "2026-11-03T10:15:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-03T10:00:30Z",
                "ended_at": "2026-11-03T10:05:00Z",
                "reps": [
                    {
                        "index": 1,
                        "score": 90,
                        "duration_ms": 2000,
                        "timestamp": 1793700030000,
                    }
                ],
            }
        ],
    }
    res_z = client.post("/sessions", json=payload_z)
    assert res_z.status_code == 201
    created = res_z.json()
    assert created["started_at"].endswith("Z")
    assert created["started_at"] == "2026-11-03T10:00:00Z"
    assert created["ended_at"] == "2026-11-03T10:15:00Z"

    session_id = created["id"]
    get_res = client.get(f"/sessions/{session_id}")
    assert get_res.status_code == 200
    retrieved = get_res.json()
    assert retrieved["started_at"] == "2026-11-03T10:00:00Z"
    assert retrieved["ended_at"] == "2026-11-03T10:15:00Z"
    assert retrieved["sets"][0]["started_at"] == "2026-11-03T10:00:30Z"
    assert retrieved["sets"][0]["ended_at"] == "2026-11-03T10:05:00Z"

    # 2. POST with "2026-11-03T12:00:00+02:00" stored and returned as "2026-11-03T10:00:00Z"
    payload_offset = {
        "started_at": "2026-11-03T12:00:00+02:00",
        "ended_at": "2026-11-03T12:15:00+02:00",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-03T12:00:30+02:00",
                "ended_at": "2026-11-03T12:05:00+02:00",
                "reps": [
                    {
                        "index": 1,
                        "score": 90,
                        "duration_ms": 2000,
                        "timestamp": 1793700030000,
                    }
                ],
            }
        ],
    }
    res_offset = client.post("/sessions", json=payload_offset)
    assert res_offset.status_code == 201
    created_offset = res_offset.json()
    assert created_offset["started_at"] == "2026-11-03T10:00:00Z"
    assert created_offset["ended_at"] == "2026-11-03T10:15:00Z"

    session_offset_id = created_offset["id"]
    get_offset = client.get(f"/sessions/{session_offset_id}")
    assert get_offset.status_code == 200
    assert get_offset.json()["started_at"] == "2026-11-03T10:00:00Z"
    assert get_offset.json()["ended_at"] == "2026-11-03T10:15:00Z"

    # 3. POST with naive "2026-11-03T10:00:00" returns 422
    payload_naive = {
        "started_at": "2026-11-03T10:00:00",
        "ended_at": "2026-11-03T10:15:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-03T10:00:30Z",
                "ended_at": "2026-11-03T10:05:00Z",
                "reps": [
                    {
                        "index": 1,
                        "score": 90,
                        "duration_ms": 2000,
                        "timestamp": 1793700030000,
                    }
                ],
            }
        ],
    }
    res_naive = client.post("/sessions", json=payload_naive)
    assert res_naive.status_code == 422

