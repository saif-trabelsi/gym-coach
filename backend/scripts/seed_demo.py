#!/usr/bin/env python3
"""
Seed demo workout sessions for AI Gym Coach.
Standard library only (urllib).

Usage:
    python scripts/seed_demo.py [--api-url http://127.0.0.1:8000]
    python scripts/seed_demo.py --clear [--api-url http://127.0.0.1:8000]
"""

import argparse
import json
import os
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
import urllib.error
import urllib.request

DEFAULT_API_URL = "http://127.0.0.1:8000"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEMO_IDS_FILE = DATA_DIR / "demo_session_ids.json"


def clear_demo_sessions(api_url: str):
    if not DEMO_IDS_FILE.exists():
        print("No demo_session_ids.json found. Nothing to clear.")
        return

    try:
        with open(DEMO_IDS_FILE, "r", encoding="utf-8") as f:
            session_ids = json.load(f)
    except Exception as e:
        print(f"Error reading {DEMO_IDS_FILE}: {e}")
        return

    if not session_ids:
        print("No recorded demo session IDs to delete.")
        return

    deleted_count = 0
    print(f"Clearing {len(session_ids)} demo session(s) from {api_url}...")

    for sid in session_ids:
        req = urllib.request.Request(
            f"{api_url}/sessions/{sid}",
            method="DELETE",
        )
        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status in (204, 200, 404):
                    deleted_count += 1
        except urllib.error.HTTPError as e:
            if e.code == 404:
                deleted_count += 1
            else:
                print(f"Failed to delete session #{sid}: HTTP {e.code}")
        except Exception as e:
            print(f"Failed to delete session #{sid}: {e}")

    try:
        DEMO_IDS_FILE.unlink(missing_ok=True)
    except Exception as e:
        print(f"Could not remove {DEMO_IDS_FILE}: {e}")

    print(f"Successfully deleted {deleted_count} demo session(s).")


def generate_rep(exercise: str, index: int, total_reps: int, base_time: datetime, drop_total: float):
    # Fatigue drift from start to end of set
    progress = index / max(1, total_reps - 1)
    drift = progress * drop_total + random.uniform(-3, 3)
    start_score = random.uniform(94, 99)
    score = max(0, min(100, int(round(start_score - drift))))

    violations = []
    metrics = {}

    if exercise == "squat":
        # Squat metrics & rules: depth (minKneeAngle), back (maxTorsoLean), tempo (descentDurationMs)
        if score < 70:
            violations = ["depth", "back"]
            metrics["minKneeAngle"] = round(random.uniform(102, 115), 1)
            metrics["maxTorsoLean"] = round(random.uniform(46, 56), 1)
            metrics["descentDurationMs"] = round(random.uniform(900, 1400), 1)
        elif score < 85:
            # Pick one violation
            v = random.choice(["depth", "tempo", "back"])
            violations = [v]
            if v == "depth":
                metrics["minKneeAngle"] = round(random.uniform(101, 108), 1)
                metrics["maxTorsoLean"] = round(random.uniform(25, 40), 1)
                metrics["descentDurationMs"] = round(random.uniform(900, 1500), 1)
            elif v == "tempo":
                metrics["minKneeAngle"] = round(random.uniform(80, 95), 1)
                metrics["maxTorsoLean"] = round(random.uniform(20, 38), 1)
                metrics["descentDurationMs"] = round(random.uniform(400, 750), 1)
            else:
                metrics["minKneeAngle"] = round(random.uniform(80, 95), 1)
                metrics["maxTorsoLean"] = round(random.uniform(46, 54), 1)
                metrics["descentDurationMs"] = round(random.uniform(900, 1500), 1)
        else:
            # Clean rep
            violations = []
            metrics["minKneeAngle"] = round(random.uniform(78, 92), 1)
            metrics["maxTorsoLean"] = round(random.uniform(18, 36), 1)
            metrics["descentDurationMs"] = round(random.uniform(1000, 2200), 1)

        metrics["descentStartMs"] = round(random.uniform(100, 300), 1)
        metrics["bottomMs"] = round(metrics["descentStartMs"] + metrics["descentDurationMs"], 1)

    else:
        # Bicep curl metrics & rules: range, extension, elbowDrift, swing
        if score < 70:
            violations = ["range", "elbowDrift"]
            metrics["minElbowAngle"] = round(random.uniform(58, 70), 1)
            metrics["maxElbowAngle"] = round(random.uniform(152, 165), 1)
            metrics["elbowDrift"] = round(random.uniform(0.24, 0.32), 2)
            metrics["bodySway"] = round(random.uniform(0.05, 0.12), 2)
        elif score < 85:
            v = random.choice(["range", "extension", "elbowDrift", "swing"])
            violations = [v]
            if v == "range":
                metrics["minElbowAngle"] = round(random.uniform(56, 68), 1)
                metrics["maxElbowAngle"] = round(random.uniform(152, 168), 1)
                metrics["elbowDrift"] = round(random.uniform(0.08, 0.18), 2)
                metrics["bodySway"] = round(random.uniform(0.04, 0.10), 2)
            elif v == "extension":
                metrics["minElbowAngle"] = round(random.uniform(38, 50), 1)
                metrics["maxElbowAngle"] = round(random.uniform(130, 148), 1)
                metrics["elbowDrift"] = round(random.uniform(0.08, 0.18), 2)
                metrics["bodySway"] = round(random.uniform(0.04, 0.10), 2)
            elif v == "elbowDrift":
                metrics["minElbowAngle"] = round(random.uniform(40, 52), 1)
                metrics["maxElbowAngle"] = round(random.uniform(152, 165), 1)
                metrics["elbowDrift"] = round(random.uniform(0.23, 0.30), 2)
                metrics["bodySway"] = round(random.uniform(0.04, 0.10), 2)
            else:
                metrics["minElbowAngle"] = round(random.uniform(40, 52), 1)
                metrics["maxElbowAngle"] = round(random.uniform(152, 165), 1)
                metrics["elbowDrift"] = round(random.uniform(0.08, 0.16), 2)
                metrics["bodySway"] = round(random.uniform(0.16, 0.24), 2)
        else:
            violations = []
            metrics["minElbowAngle"] = round(random.uniform(36, 50), 1)
            metrics["maxElbowAngle"] = round(random.uniform(152, 168), 1)
            metrics["elbowDrift"] = round(random.uniform(0.06, 0.18), 2)
            metrics["bodySway"] = round(random.uniform(0.03, 0.11), 2)

    rep_duration_ms = int(random.uniform(1800, 2600))
    rep_time = base_time + timedelta(seconds=index * 4)
    rep_timestamp_ms = int(rep_time.timestamp() * 1000)

    return {
        "index": index + 1,
        "score": score,
        "duration_ms": rep_duration_ms,
        "metrics": metrics,
        "violations": violations,
        "timestamp": rep_timestamp_ms,
    }


def seed_demo_sessions(api_url: str):
    random.seed(42)

    # 8 sessions spread over last 14 days (including today)
    # Day offsets: 13, 11, 9, 7, 5, 3, 1, 0 days ago
    day_offsets = [13, 11, 9, 7, 5, 3, 1, 0]
    now_utc = datetime.now(timezone.utc).replace(microsecond=0)

    created_ids = []
    print(f"Seeding 8 demo sessions to {api_url}...")

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    for sess_idx, offset_days in enumerate(day_offsets):
        session_date = now_utc - timedelta(days=offset_days)
        # Fix workout start around 10:00 or 17:00 UTC
        hour = 10 if sess_idx % 2 == 0 else 17
        sess_start = session_date.replace(hour=hour, minute=random.randint(5, 30), second=0)

        sets_payload = []
        current_time = sess_start

        # 2 sets per session: alternate squat and bicepCurl
        exercises = ["squat", "bicepCurl"] if sess_idx % 2 == 0 else ["bicepCurl", "squat"]

        for set_idx, ex in enumerate(exercises):
            num_reps = random.randint(6, 10)
            # Realistic fatigue: drop by 12 to 28 points across the set
            drop_total = random.uniform(12, 28)

            set_reps = []
            for r_idx in range(num_reps):
                rep = generate_rep(ex, r_idx, num_reps, current_time, drop_total)
                set_reps.append(rep)

            first_rep = set_reps[0]
            last_rep = set_reps[-1]
            set_start_ms = first_rep["timestamp"] - first_rep["duration_ms"]
            set_end_ms = last_rep["timestamp"]

            set_start_iso = datetime.fromtimestamp(set_start_ms / 1000.0, tz=timezone.utc).isoformat().replace("+00:00", "Z")
            set_end_iso = datetime.fromtimestamp(set_end_ms / 1000.0, tz=timezone.utc).isoformat().replace("+00:00", "Z")

            sets_payload.append({
                "exercise": ex,
                "started_at": set_start_iso,
                "ended_at": set_end_iso,
                "reps": set_reps,
            })

            # Rest between sets: 2 minutes
            current_time = datetime.fromtimestamp(set_end_ms / 1000.0, tz=timezone.utc) + timedelta(minutes=2)

        session_start_iso = sets_payload[0]["started_at"]
        session_end_iso = sets_payload[-1]["ended_at"]

        payload = {
            "started_at": session_start_iso,
            "ended_at": session_end_iso,
            "sets": sets_payload,
        }

        req = urllib.request.Request(
            f"{api_url}/sessions",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status == 201:
                    data = json.loads(resp.read().decode("utf-8"))
                    created_ids.append(data["id"])
                    total_r = sum(len(s["reps"]) for s in sets_payload)
                    avg_s = round(sum(r["score"] for s in sets_payload for r in s["reps"]) / total_r, 1)
                    print(f"  [+] Created session #{data['id']}: {session_start_iso[:10]} ({exercises[0]}, {exercises[1]}), {total_r} reps, avg {avg_s}")
                else:
                    print(f"  [-] Unexpected status {resp.status} creating session")
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8")
            print(f"  [-] Error {e.code}: {err_msg}")
        except Exception as e:
            print(f"  [-] Connection error: {e}")

    # Save created session IDs
    if created_ids:
        with open(DEMO_IDS_FILE, "w", encoding="utf-8") as f:
            json.dump(created_ids, f, indent=2)
        print(f"\nSuccessfully seeded {len(created_ids)} sessions! (IDs recorded in {DEMO_IDS_FILE})")
    else:
        print("\nNo sessions were created (check if backend server is running).")


def main():
    parser = argparse.ArgumentParser(description="Seed demo workout data for AI Gym Coach.")
    parser.add_argument(
        "--api-url",
        default=DEFAULT_API_URL,
        help=f"Backend API URL (default: {DEFAULT_API_URL})",
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Delete all demo sessions previously created by this script.",
    )

    args = parser.parse_args()
    api_url = args.api_url.rstrip("/")

    if args.clear:
        clear_demo_sessions(api_url)
    else:
        seed_demo_sessions(api_url)


if __name__ == "__main__":
    main()
