#!/usr/bin/env python3
"""
Generate a sample workout session with synthetic stick figure skeleton animation replay.
Standard library only.

Usage:
    python scripts/sample_replay.py [--api-url http://127.0.0.1:8000]
"""

import argparse
from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path
import sys
import urllib.error
import urllib.request

DEFAULT_API_URL = "http://127.0.0.1:8000"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEMO_IDS_FILE = DATA_DIR / "demo_session_ids.json"


def generate_squat_replay(fps: int = 15, num_frames: int = 40) -> dict:
    """
    Generates 40 frames (~2.66s at 15fps) of a side-view squat stick figure
    with left knee (index 25) highlighted and 'depth' violation.
    """
    frames = []
    for i in range(num_frames):
        t = i / float(num_frames - 1)
        # Sine curve 0 -> 1 -> 0 representing descent and ascent
        d = math.sin(math.pi * t)

        # Planted feet/ankles
        ankle_x, ankle_y = 0.50, 0.85
        heel_x, heel_y = 0.46, 0.88
        foot_x, foot_y = 0.58, 0.88

        # Knee flexes forward
        knee_x = 0.52 + 0.05 * d
        knee_y = 0.65 - 0.02 * d

        # Hip moves back and down (shallow squat for depth violation)
        hip_x = 0.48 - 0.09 * d
        hip_y = 0.46 + 0.15 * d

        # Torso / shoulders lean slightly
        shoulder_x = 0.48 - 0.04 * d
        shoulder_y = 0.25 + 0.14 * d

        # Arms
        elbow_x = shoulder_x + 0.05
        elbow_y = shoulder_y + 0.10
        wrist_x = shoulder_x + 0.08
        wrist_y = shoulder_y + 0.05

        # Head / nose
        head_x = shoulder_x + 0.03
        head_y = shoulder_y - 0.10

        frame = [None] * 33
        # Head / face landmarks 0-10
        for h_idx in range(11):
            frame[h_idx] = [round(head_x, 4), round(head_y + h_idx * 0.005, 4)]

        # Shoulders (11: left, 12: right)
        frame[11] = [round(shoulder_x, 4), round(shoulder_y, 4)]
        frame[12] = [round(shoulder_x + 0.02, 4), round(shoulder_y, 4)]

        # Elbows (13: left, 14: right)
        frame[13] = [round(elbow_x, 4), round(elbow_y, 4)]
        frame[14] = [round(elbow_x + 0.02, 4), round(elbow_y, 4)]

        # Wrists (15: left, 16: right)
        frame[15] = [round(wrist_x, 4), round(wrist_y, 4)]
        frame[16] = [round(wrist_x + 0.02, 4), round(wrist_y, 4)]

        # Hands / fingers (17-22)
        for h_idx in range(17, 23):
            frame[h_idx] = [round(wrist_x + 0.01, 4), round(wrist_y + 0.01, 4)]

        # Hips (23: left, 24: right)
        frame[23] = [round(hip_x, 4), round(hip_y, 4)]
        frame[24] = [round(hip_x + 0.02, 4), round(hip_y, 4)]

        # Knees (25: left knee, 26: right knee)
        frame[25] = [round(knee_x, 4), round(knee_y, 4)]
        frame[26] = [round(knee_x + 0.02, 4), round(knee_y, 4)]

        # Ankles (27: left, 28: right)
        frame[27] = [round(ankle_x, 4), round(ankle_y, 4)]
        frame[28] = [round(ankle_x + 0.02, 4), round(ankle_y, 4)]

        # Heels (29: left, 30: right)
        frame[29] = [round(heel_x, 4), round(heel_y, 4)]
        frame[30] = [round(heel_x + 0.02, 4), round(heel_y, 4)]

        # Foot indices (31: left, 32: right)
        frame[31] = [round(foot_x, 4), round(foot_y, 4)]
        frame[32] = [round(foot_x + 0.02, 4), round(foot_y, 4)]

        frames.append(frame)

    return {
        "version": 1,
        "fps": fps,
        "aspect": 1.33,
        "mirrored": False,
        "frames": frames,
        "highlight": [25],
        "violations": ["depth"],
    }


def register_session_id(session_id: int):
    """
    Registers the session id in backend/data/demo_session_ids.json
    so that scripts/seed_demo.py --clear can remove it.
    """
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    session_ids = []
    if DEMO_IDS_FILE.exists():
        try:
            with open(DEMO_IDS_FILE, "r", encoding="utf-8") as f:
                session_ids = json.load(f)
        except Exception:
            session_ids = []

    if session_id not in session_ids:
        session_ids.append(session_id)

    with open(DEMO_IDS_FILE, "w", encoding="utf-8") as f:
        json.dump(session_ids, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Create a sample workout session with replay animation.")
    parser.add_argument(
        "--api-url",
        default=DEFAULT_API_URL,
        help=f"Backend API URL (default: {DEFAULT_API_URL})",
    )
    args = parser.parse_args()
    api_url = args.api_url.rstrip("/")

    now = datetime.now(timezone.utc)
    set_start = now - timedelta(minutes=2)
    set_end = now

    replay_data = generate_squat_replay(fps=15, num_frames=40)

    # 1 set of 3 reps: lowest scoring rep is rep 2 with depth violation and replay
    payload = {
        "started_at": (set_start - timedelta(seconds=10)).isoformat().replace("+00:00", "Z"),
        "ended_at": (set_end + timedelta(seconds=10)).isoformat().replace("+00:00", "Z"),
        "sets": [
            {
                "exercise": "squat",
                "started_at": set_start.isoformat().replace("+00:00", "Z"),
                "ended_at": set_end.isoformat().replace("+00:00", "Z"),
                "reps": [
                    {
                        "index": 1,
                        "score": 95,
                        "duration_ms": 2100,
                        "metrics": {"minKneeAngle": 82.5, "descentDurationMs": 1100},
                        "violations": [],
                        "timestamp": int(set_start.timestamp() * 1000),
                    },
                    {
                        "index": 2,
                        "score": 65,  # Lowest scoring rep
                        "duration_ms": 2660,
                        "metrics": {"minKneeAngle": 105.2, "descentDurationMs": 1300},
                        "violations": ["depth"],
                        "timestamp": int((set_start + timedelta(seconds=30)).timestamp() * 1000),
                        "replay": replay_data,
                    },
                    {
                        "index": 3,
                        "score": 90,
                        "duration_ms": 2200,
                        "metrics": {"minKneeAngle": 84.0, "descentDurationMs": 1150},
                        "violations": [],
                        "timestamp": int((set_start + timedelta(seconds=60)).timestamp() * 1000),
                    },
                ],
            }
        ],
    }

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{api_url}/sessions",
        data=req_data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status != 201:
                print(f"Failed to create session, HTTP status: {resp.status}")
                sys.exit(1)
            created = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode('utf-8')}")
        sys.exit(1)
    except Exception as e:
        print(f"Connection error to {api_url}: {e}")
        sys.exit(1)

    session_id = created["id"]
    # Find rep with has_replay == True
    replay_rep_id = None
    for s in created["sets"]:
        for r in s["reps"]:
            if r.get("has_replay"):
                replay_rep_id = r["id"]
                break

    print(f"Session ID: {session_id}")
    print(f"Rep ID: {replay_rep_id}")

    register_session_id(session_id)
    print(f"Registered session #{session_id} in {DEMO_IDS_FILE}")


if __name__ == "__main__":
    main()
