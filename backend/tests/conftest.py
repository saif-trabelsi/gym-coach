import os
os.environ["TESTING"] = "1"

from typing import Generator
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from app.db import get_session, migrate_db
from app.main import app

DEFAULT_DEVICE_ID = "00000000-0000-4000-8000-000000000001"


@pytest.fixture(name="db_session")
def session_fixture() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    SQLModel.metadata.create_all(engine)
    migrate_db(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(db_session: Session) -> Generator[TestClient, None, None]:
    def get_session_override():
        return db_session

    app.dependency_overrides[get_session] = get_session_override
    with TestClient(app, headers={"X-Device-Id": DEFAULT_DEVICE_ID}) as test_client:
        yield test_client
    app.dependency_overrides.clear()
