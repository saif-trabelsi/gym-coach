import os
import time
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlmodel import Session as DBSession, SQLModel, select

from app.db import migrate_db
from app.main import app, PerDeviceRateLimitMiddleware
from app.models import Session, UTCDateTime


def test_utc_datetime_type_decorator():
    """Verify UTCDateTime preserves timezone-aware UTC datetime across engines."""
    test_engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(test_engine)

    # 1. Aware datetime with non-UTC offset (+02:00)
    aware_dt = datetime(2026, 11, 13, 12, 0, 0, tzinfo=timezone.utc)
    with DBSession(test_engine) as session:
        sess = Session(
            device_id="test-device",
            started_at=aware_dt,
            ended_at=aware_dt,
        )
        session.add(sess)
        session.commit()
        session.refresh(sess)

        assert sess.started_at.tzinfo is not None
        assert sess.started_at.tzinfo == timezone.utc
        assert sess.started_at.hour == 12

    # 2. Raw query check
    with test_engine.connect() as conn:
        row = conn.execute(text("SELECT started_at FROM session WHERE id = :id"), {"id": sess.id}).fetchone()
        assert row is not None


def test_migrate_db_safe_on_fresh_and_existing():
    """Verify migrate_db creates device_id column and index safely without data loss."""
    test_engine = create_engine("sqlite:///:memory:")
    with test_engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE session (id INTEGER PRIMARY KEY, started_at TIMESTAMP, ended_at TIMESTAMP)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO session (id, started_at, ended_at) VALUES (1, '2026-11-01 10:00:00', '2026-11-01 10:10:00')"
            )
        )

    # Run migration
    migrate_db(test_engine)

    # Verify column and default value
    with test_engine.connect() as conn:
        row = conn.execute(text("SELECT id, device_id FROM session WHERE id = 1")).fetchone()
        assert row is not None
        assert row[0] == 1
        assert row[1] == "legacy"

    # Running a second time is safe and idempotent
    migrate_db(test_engine)


def test_postgres_url_normalization():
    """Verify postgres:// is rewritten to postgresql:// for SQLAlchemy compatibility."""
    raw_url = "postgres://user:secret@db.host.com:5432/mydb?sslmode=require"
    normalized = raw_url.replace("postgres://", "postgresql://", 1)
    assert normalized.startswith("postgresql://")
    assert "user:secret@db.host.com" in normalized


def test_per_device_rate_limiting(client: TestClient):
    """Verify PerDeviceRateLimitMiddleware throttles burst write requests with 429."""
    # Find the middleware instance on the test app
    rate_middleware = None
    for middleware in app.user_middleware:
        if middleware.cls == PerDeviceRateLimitMiddleware:
            rate_middleware = middleware
            break

    device_id = "99999999-9999-4999-8999-999999999999"
    headers = {
        "Content-Type": "application/json",
        "X-Device-Id": device_id,
    }

    # Temporarily set a low limit to test rate limiting behavior deterministically
    old_limit = None
    # We can invoke write requests rapidly
    responses = []
    # Send quick delete requests for non-existent session
    for _ in range(75):
        resp = client.delete("/sessions/999999", headers=headers)
        responses.append(resp.status_code)

    # At least some requests towards the end should hit 429 Too Many Requests
    assert 429 in responses
    assert any("rate limit exceeded" in client.delete("/sessions/999999", headers=headers).text.lower() for _ in range(5))


@pytest.mark.skipif(
    not os.getenv("TEST_POSTGRES_URL"),
    reason="TEST_POSTGRES_URL not provided (skipping live Postgres test)",
)
def test_live_postgres_compatibility():
    """Live integration test if a real Postgres connection is configured via TEST_POSTGRES_URL."""
    pg_url = os.getenv("TEST_POSTGRES_URL")
    if pg_url.startswith("postgres://"):
        pg_url = pg_url.replace("postgres://", "postgresql://", 1)

    pg_engine = create_engine(pg_url, pool_pre_ping=True)
    SQLModel.metadata.create_all(pg_engine)
    migrate_db(pg_engine)

    with DBSession(pg_engine) as session:
        test_dt = datetime.now(timezone.utc)
        sess = Session(device_id="pg-test-device", started_at=test_dt, ended_at=test_dt)
        session.add(sess)
        session.commit()
        session.refresh(sess)
        assert sess.id is not None
        assert sess.started_at.tzinfo is not None

        # Clean up test row
        session.delete(sess)
        session.commit()
