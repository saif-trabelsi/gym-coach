from fastapi.testclient import TestClient


def test_stats_progress_aggregation_and_filtering(client: TestClient):
    # Session 1: 2026-11-01, Squats with scores 100 and 90
    s1_payload = {
        "started_at": "2026-11-01T09:00:00Z",
        "ended_at": "2026-11-01T09:20:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-01T09:05:00Z",
                "ended_at": "2026-11-01T09:15:00Z",
                "reps": [
                    {"index": 1, "score": 100, "duration_ms": 2000, "timestamp": 1793523900000},
                    {"index": 2, "score": 90, "duration_ms": 2100, "timestamp": 1793523905000},
                ],
            }
        ],
    }

    # Session 2: same day 2026-11-01, Squats with score 80
    # Combined with Session 1: 3 reps, scores [100, 90, 80] -> average = 90.0
    s2_payload = {
        "started_at": "2026-11-01T15:00:00Z",
        "ended_at": "2026-11-01T15:20:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-01T15:05:00Z",
                "ended_at": "2026-11-01T15:15:00Z",
                "reps": [
                    {"index": 1, "score": 80, "duration_ms": 1900, "timestamp": 1793545500000},
                ],
            }
        ],
    }

    # Session 3: different day 2026-11-02, Bicep Curl with scores 85 and 75 -> average = 80.0
    s3_payload = {
        "started_at": "2026-11-02T10:00:00Z",
        "ended_at": "2026-11-02T10:20:00Z",
        "sets": [
            {
                "exercise": "bicepCurl",
                "started_at": "2026-11-02T10:05:00Z",
                "ended_at": "2026-11-02T10:15:00Z",
                "reps": [
                    {"index": 1, "score": 85, "duration_ms": 1800, "timestamp": 1793613900000},
                    {"index": 2, "score": 75, "duration_ms": 1700, "timestamp": 1793613905000},
                ],
            }
        ],
    }

    client.post("/sessions", json=s1_payload)
    client.post("/sessions", json=s2_payload)
    client.post("/sessions", json=s3_payload)

    # 1. Unfiltered progress stats (sorted by date ascending)
    res_all = client.get("/stats/progress")
    assert res_all.status_code == 200
    rows_all = res_all.json()
    assert len(rows_all) == 2

    # First row: 2026-11-01 Squats
    assert rows_all[0]["date"] == "2026-11-01"
    assert rows_all[0]["exercise"] == "squat"
    assert rows_all[0]["reps"] == 3
    assert rows_all[0]["average_score"] == 90.0

    # Second row: 2026-11-02 Bicep Curl
    assert rows_all[1]["date"] == "2026-11-02"
    assert rows_all[1]["exercise"] == "bicepCurl"
    assert rows_all[1]["reps"] == 2
    assert rows_all[1]["average_score"] == 80.0

    # 2. Filter by exercise=bicepCurl
    res_bicep = client.get("/stats/progress?exercise=bicepCurl")
    assert res_bicep.status_code == 200
    rows_bicep = res_bicep.json()
    assert len(rows_bicep) == 1
    assert rows_bicep[0]["date"] == "2026-11-02"
    assert rows_bicep[0]["exercise"] == "bicepCurl"
    assert rows_bicep[0]["reps"] == 2
    assert rows_bicep[0]["average_score"] == 80.0

    # 3. Filter by exercise=squat
    res_squat = client.get("/stats/progress?exercise=squat")
    assert res_squat.status_code == 200
    rows_squat = res_squat.json()
    assert len(rows_squat) == 1
    assert rows_squat[0]["date"] == "2026-11-01"
    assert rows_squat[0]["exercise"] == "squat"
    assert rows_squat[0]["reps"] == 3
    assert rows_squat[0]["average_score"] == 90.0


def test_stats_progress_tz_offset_day_shift(client: TestClient):
    # Rep at 23:30 UTC Nov 3, 2026 -> 1793748600000 epoch ms
    payload = {
        "started_at": "2026-11-03T23:25:00Z",
        "ended_at": "2026-11-03T23:35:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-03T23:28:00Z",
                "ended_at": "2026-11-03T23:32:00Z",
                "reps": [
                    {
                        "index": 1,
                        "score": 90,
                        "duration_ms": 2000,
                        "timestamp": 1793748600000,
                    }
                ],
            }
        ],
    }
    create_res = client.post("/sessions", json=payload)
    assert create_res.status_code == 201

    # With tz_offset_minutes=0 (UTC), 23:30 is 2026-11-03
    res_utc = client.get("/stats/progress?tz_offset_minutes=0")
    assert res_utc.status_code == 200
    rows_utc = res_utc.json()
    assert len(rows_utc) == 1
    assert rows_utc[0]["date"] == "2026-11-03"

    # With tz_offset_minutes=60 (+01:00), 23:30 UTC becomes 00:30 next day, so 2026-11-04
    res_shift = client.get("/stats/progress?tz_offset_minutes=60")
    assert res_shift.status_code == 200
    rows_shift = res_shift.json()
    assert len(rows_shift) == 1
    assert rows_shift[0]["date"] == "2026-11-04"


def test_stats_progress_tz_offset_out_of_bounds_422(client: TestClient):
    # tz_offset_minutes must be between -840 and 840. 900 must return 422
    res_high = client.get("/stats/progress?tz_offset_minutes=900")
    assert res_high.status_code == 422

    res_low = client.get("/stats/progress?tz_offset_minutes=-900")
    assert res_low.status_code == 422

