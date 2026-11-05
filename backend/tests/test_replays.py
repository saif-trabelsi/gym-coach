import json
from datetime import datetime, timezone
from typing import Any, Dict, List
from fastapi.testclient import TestClient
import pytest
from sqlmodel import Session as DBSession, select

from app.models import Rep, RepReplay, Session, WorkoutSet
from app.reports.providers.base import BaseLLMProvider
from app.reports.service import generate_report


def make_valid_replay(
    version: int = 1,
    fps: int = 15,
    aspect: float = 1.33,
    mirrored: bool = False,
    num_frames: int = 5,
    highlight: List[int] = None,
    violations: List[str] = None,
) -> Dict[str, Any]:
    if highlight is None:
        highlight = [25]
    if violations is None:
        violations = ["depth"]

    frames = []
    for _ in range(num_frames):
        # 33 valid coordinate pairs between -0.5 and 1.5
        frame = [[0.5, 0.5] for _ in range(33)]
        frames.append(frame)

    return {
        "version": version,
        "fps": fps,
        "aspect": aspect,
        "mirrored": mirrored,
        "frames": frames,
        "highlight": highlight,
        "violations": violations,
    }


def make_session_payload(
    reps: List[Dict[str, Any]],
    exercise: str = "squat",
) -> Dict[str, Any]:
    now = datetime(2026, 11, 5, 10, 0, 0, tzinfo=timezone.utc)
    return {
        "started_at": now.isoformat().replace("+00:00", "Z"),
        "ended_at": datetime(2026, 11, 5, 10, 10, 0, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
        "sets": [
            {
                "exercise": exercise,
                "started_at": now.isoformat().replace("+00:00", "Z"),
                "ended_at": datetime(2026, 11, 5, 10, 5, 0, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
                "reps": reps,
            }
        ],
    }


# a. POST a session with one valid replay on one rep: 201, that rep has has_replay true and the other reps false,
# GET /sessions/{id} contains no "frames" key anywhere, GET /reps/{rep_id}/replay returns data identical to what was sent.
def test_a_post_session_with_valid_replay_and_get_replay(client: TestClient):
    replay_data = make_valid_replay(num_frames=10, highlight=[25], violations=["depth"])
    payload = make_session_payload(
        reps=[
            {
                "index": 1,
                "score": 90,
                "duration_ms": 2000,
                "metrics": {"minKneeAngle": 85.0},
                "violations": [],
                "timestamp": 1793700000000,
                "replay": replay_data,
            },
            {
                "index": 2,
                "score": 95,
                "duration_ms": 2100,
                "metrics": {"minKneeAngle": 82.0},
                "violations": [],
                "timestamp": 1793700005000,
            },
        ]
    )

    # 1. POST session -> 201
    resp = client.post("/sessions", json=payload)
    assert resp.status_code == 201
    created = resp.json()
    assert "id" in created

    reps = created["sets"][0]["reps"]
    assert len(reps) == 2
    assert reps[0]["has_replay"] is True
    assert reps[1]["has_replay"] is False
    assert "frames" not in json.dumps(created)

    rep1_id = reps[0]["id"]
    rep2_id = reps[1]["id"]
    session_id = created["id"]

    # 2. GET /sessions/{id} -> contains no "frames" key anywhere
    get_sess_resp = client.get(f"/sessions/{session_id}")
    assert get_sess_resp.status_code == 200
    sess_json = get_sess_resp.json()
    assert "frames" not in json.dumps(sess_json)
    assert sess_json["sets"][0]["reps"][0]["has_replay"] is True
    assert sess_json["sets"][0]["reps"][1]["has_replay"] is False

    # 3. GET /reps/{rep_id}/replay -> returns data identical to what was sent
    rep_replay_resp = client.get(f"/reps/{rep1_id}/replay")
    assert rep_replay_resp.status_code == 200
    assert rep_replay_resp.json() == replay_data


# b. 422 cases, each separately:
# version 2, fps 60, fps 3, 1 frame, 151 frames, a frame with 32 entries,
# a coordinate 2.5, a string coordinate, highlight [40], highlight [25, 25],
# two replays in the same set, aspect 0, a replay larger than 120000 bytes.
@pytest.mark.parametrize(
    "case_name, mutate_fn",
    [
        ("version 2", lambda r: r.update({"version": 2})),
        ("fps 60", lambda r: r.update({"fps": 60})),
        ("fps 3", lambda r: r.update({"fps": 3})),
        ("1 frame", lambda r: r.update({"frames": [[[0.5, 0.5] for _ in range(33)]]})),
        ("151 frames", lambda r: r.update({"frames": [[[0.5, 0.5] for _ in range(33)] for _ in range(151)]})),
        ("a frame with 32 entries", lambda r: r.update({"frames": [[[0.5, 0.5] for _ in range(32)] for _ in range(3)]})),
        ("a coordinate 2.5", lambda r: r["frames"][0].__setitem__(0, [2.5, 0.5])),
        ("a string coordinate", lambda r: r["frames"][0].__setitem__(0, ["0.5", 0.5])),
        ("highlight [40]", lambda r: r.update({"highlight": [40]})),
        ("highlight [25, 25]", lambda r: r.update({"highlight": [25, 25]})),
        ("aspect 0", lambda r: r.update({"aspect": 0})),
        (
            "a replay larger than 120000 bytes",
            lambda r: r.update({
                # 150 frames with non-trivial floats will comfortably exceed 120,000 bytes when serialized
                "frames": [
                    [[0.123456789012345, 0.987654321098765] for _ in range(33)]
                    for _ in range(140)
                ]
            }),
        ),
    ],
)
def test_b_validation_422_single_replay_cases(client: TestClient, case_name: str, mutate_fn):
    replay = make_valid_replay(num_frames=5)
    mutate_fn(replay)

    payload = make_session_payload(
        reps=[
            {
                "index": 1,
                "score": 90,
                "duration_ms": 2000,
                "metrics": {},
                "violations": [],
                "timestamp": 1793700000000,
                "replay": replay,
            }
        ]
    )

    resp = client.post("/sessions", json=payload)
    assert resp.status_code == 422, f"Expected 422 for case '{case_name}', got {resp.status_code}: {resp.text}"


def test_b_validation_422_two_replays_in_same_set(client: TestClient):
    # Two replays in the same set must be rejected with 422
    replay1 = make_valid_replay(num_frames=3)
    replay2 = make_valid_replay(num_frames=3)
    payload = make_session_payload(
        reps=[
            {
                "index": 1,
                "score": 85,
                "duration_ms": 2000,
                "metrics": {},
                "violations": [],
                "timestamp": 1793700000000,
                "replay": replay1,
            },
            {
                "index": 2,
                "score": 80,
                "duration_ms": 2000,
                "metrics": {},
                "violations": [],
                "timestamp": 1793700005000,
                "replay": replay2,
            },
        ]
    )

    resp = client.post("/sessions", json=payload)
    assert resp.status_code == 422
    assert "More than one replay in the same set is not allowed" in resp.text


# c. GET /reps/99999/replay gives 404, and a rep without replay gives 404.
def test_c_replay_404_cases(client: TestClient):
    # 1. Non-existent rep
    resp = client.get("/reps/99999/replay")
    assert resp.status_code == 404
    assert "not found" in resp.text.lower()

    # 2. Existing rep without replay
    payload = make_session_payload(
        reps=[
            {
                "index": 1,
                "score": 90,
                "duration_ms": 2000,
                "metrics": {},
                "violations": [],
                "timestamp": 1793700000000,
            }
        ]
    )
    post_resp = client.post("/sessions", json=payload)
    assert post_resp.status_code == 201
    rep_id = post_resp.json()["sets"][0]["reps"][0]["id"]

    rep_resp = client.get(f"/reps/{rep_id}/replay")
    assert rep_resp.status_code == 404
    assert "has no replay" in rep_resp.text.lower()


# d. Deleting a session deletes its replays (query the table directly).
def test_d_cascade_delete_session_deletes_replays(client: TestClient, db_session: DBSession):
    replay_data = make_valid_replay(num_frames=4)
    payload = make_session_payload(
        reps=[
            {
                "index": 1,
                "score": 88,
                "duration_ms": 2000,
                "metrics": {},
                "violations": [],
                "timestamp": 1793700000000,
                "replay": replay_data,
            }
        ]
    )
    post_resp = client.post("/sessions", json=payload)
    assert post_resp.status_code == 201
    session_id = post_resp.json()["id"]

    # Verify RepReplay exists in DB
    replays_in_db = db_session.exec(select(RepReplay)).all()
    assert len(replays_in_db) == 1

    # Delete the session
    del_resp = client.delete(f"/sessions/{session_id}")
    assert del_resp.status_code == 204

    # Verify RepReplay was cascaded and deleted
    replays_after_del = db_session.exec(select(RepReplay)).all()
    assert len(replays_after_del) == 0


# e. A body larger than 2 MB gives 413.
def test_e_body_larger_than_2mb_gives_413(client: TestClient):
    large_payload_bytes = b"x" * (2 * 1024 * 1024 + 100)
    resp = client.post(
        "/sessions",
        content=large_payload_bytes,
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 413
    assert "too large" in resp.text.lower()


# f. An old style payload without any replay still works exactly as before.
def test_f_old_style_payload_without_replay_still_works(client: TestClient):
    old_payload = {
        "started_at": "2026-11-05T10:00:00Z",
        "ended_at": "2026-11-05T10:15:00Z",
        "sets": [
            {
                "exercise": "squat",
                "started_at": "2026-11-05T10:00:10Z",
                "ended_at": "2026-11-05T10:05:00Z",
                "reps": [
                    {
                        "index": 1,
                        "score": 92,
                        "duration_ms": 1900,
                        "metrics": {"minKneeAngle": 86.4},
                        "violations": [],
                        "timestamp": 1793700000000,
                    }
                ],
            }
        ],
    }
    resp = client.post("/sessions", json=old_payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["sets"][0]["reps"][0]["has_replay"] is False
    assert data["sets"][0]["reps"][0]["score"] == 92


# g. POST /sessions/{id}/report on a session with replays works and the prompt sent to the provider contains no "frames" and no replay content.
def test_g_coaching_report_does_not_contain_or_read_replay(client: TestClient, db_session: DBSession):
    replay_data = make_valid_replay(num_frames=8, violations=["depth"])
    payload = make_session_payload(
        reps=[
            {
                "index": 1,
                "score": 75,
                "duration_ms": 2200,
                "metrics": {"minKneeAngle": 102.0},
                "violations": ["depth"],
                "timestamp": 1793700000000,
                "replay": replay_data,
            }
        ]
    )
    post_resp = client.post("/sessions", json=payload)
    assert post_resp.status_code == 201
    session_id = post_resp.json()["id"]

    captured_calls = []

    class CapturingProvider(BaseLLMProvider):
        def generate(self, system: str, prompt: str, language: str, stats: Any = None) -> str:
            captured_calls.append({"system": system, "prompt": prompt, "stats": stats})
            return json.dumps({
                "summary": "Coaching summary without replay.",
                "strengths": ["Consistent cadence"],
                "issues": [{"rule": "depth", "explanation": "Go lower", "tip": "Sink hips lower"}],
                "next_session": ["Focus on depth", "Warm up properly"],
                "fatigue_note": "No fatigue.",
            })

    report = generate_report(
        session_id=session_id,
        db=db_session,
        language="en",
        force=True,
        custom_provider=CapturingProvider(),
    )

    assert len(captured_calls) == 1
    call = captured_calls[0]
    prompt_text = call["prompt"]
    system_text = call["system"]

    assert "frames" not in prompt_text
    assert "replay" not in prompt_text
    assert "aspect" not in prompt_text
    assert "frames" not in system_text
    assert "replay" not in system_text

    # Verify report stats do not have replay
    report_stats_str = json.dumps(report.stats)
    assert "frames" not in report_stats_str
    assert "replay" not in report_stats_str


def test_sample_replay_script_generates_valid_replay(client: TestClient):
    from scripts.sample_replay import generate_squat_replay

    replay = generate_squat_replay(fps=15, num_frames=40)
    assert replay["version"] == 1
    assert replay["fps"] == 15
    assert len(replay["frames"]) == 40
    assert replay["highlight"] == [25]
    assert replay["violations"] == ["depth"]

    payload = make_session_payload(
        reps=[
            {
                "index": 1,
                "score": 90,
                "duration_ms": 2000,
                "metrics": {},
                "violations": [],
                "timestamp": 1793700000000,
            },
            {
                "index": 2,
                "score": 65,
                "duration_ms": 2660,
                "metrics": {},
                "violations": ["depth"],
                "timestamp": 1793700005000,
                "replay": replay,
            },
            {
                "index": 3,
                "score": 88,
                "duration_ms": 2100,
                "metrics": {},
                "violations": [],
                "timestamp": 1793700010000,
            },
        ]
    )
    resp = client.post("/sessions", json=payload)
    assert resp.status_code == 201
    created = resp.json()
    rep2 = created["sets"][0]["reps"][1]
    assert rep2["has_replay"] is True

    rep_resp = client.get(f"/reps/{rep2['id']}/replay")
    assert rep_resp.status_code == 200
    assert rep_resp.json()["highlight"] == [25]
    assert rep_resp.json()["violations"] == ["depth"]
