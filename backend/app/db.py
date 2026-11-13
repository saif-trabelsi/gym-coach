import os
from pathlib import Path
from typing import Generator, Optional
from dotenv import load_dotenv
from sqlalchemy import event, inspect, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

load_dotenv(BASE_DIR / ".env")

raw_db_url = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'gymcoach.db'}").strip()
# Normalize legacy postgres:// prefix to postgresql:// for SQLAlchemy 2.0+
if raw_db_url.startswith("postgres://"):
    raw_db_url = raw_db_url.replace("postgres://", "postgresql://", 1)

DATABASE_URL = raw_db_url

engine_kwargs = {}
if "sqlite" in DATABASE_URL:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_recycle"] = 300

engine = create_engine(DATABASE_URL, **engine_kwargs)


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if "sqlite" in str(type(dbapi_connection)).lower():
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
        except Exception:
            pass


def migrate_db(target_engine: Optional[Engine] = None) -> None:
    eng = target_engine or engine
    with eng.begin() as conn:
        inspector = inspect(conn)
        tables = inspector.get_table_names()
        if "session" in tables:
            columns = [col["name"] for col in inspector.get_columns("session")]
            if "device_id" not in columns:
                conn.execute(
                    text("ALTER TABLE session ADD COLUMN device_id TEXT NOT NULL DEFAULT 'legacy'")
                )
                conn.execute(
                    text("CREATE INDEX IF NOT EXISTS ix_session_device_id ON session(device_id)")
                )


def init_db(target_engine: Optional[Engine] = None) -> None:
    import app.models  # noqa: F401
    eng = target_engine or engine
    if DATABASE_URL.startswith("sqlite:///"):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(eng)
    migrate_db(eng)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
