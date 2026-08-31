"""
Tests for /api/data-status — the endpoint that would have caught the silent
failure this deployment actually had (database gone, file fallback serving a
pre-season snapshot, every health check green while the site told visitors the
season had not started).

The interesting cases need a real database, so they skip unless
TEST_DATABASE_URL is set — see tests/test_snapshot_retention.py for how to
provide one. The file-fallback case needs nothing and always runs.
"""
import json
import os
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

SEASON = "2026_27"  # data_status reads the live season specifically


def test_reports_the_file_fallback_when_the_database_is_unreachable(client):
    """
    conftest pins DATABASE_URL at an unreachable host, so this is the exact
    shape prod serves today: files, no snapshot timestamp, and no crash.
    """
    body = client.get("/api/data-status").json()

    assert body["source"] == "files"
    assert body["snapshot_fetched_at"] is None
    # A file's mtime is its checkout time, not its data time; claiming an age
    # would be worse than admitting there isn't one.
    assert body["snapshot_age_hours"] is None
    assert "stale" in body and "reasons" in body


@pytest.fixture
def db_with(monkeypatch):
    """Seed one live-season bootstrap snapshot, and point the app at it."""
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set (needs a live Postgres)")

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from fpl.data import loaders
    from fpl.data.db import session as session_mod

    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True, future=True)
    monkeypatch.setattr(session_mod, "engine", engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
    monkeypatch.setattr(session_mod, "SessionLocal", SessionLocal)
    # fpl.data.db.read imported SessionLocal by value at import time.
    from fpl.data.db import read as read_mod

    monkeypatch.setattr(read_mod, "SessionLocal", SessionLocal)

    saved = []

    def seed(bootstrap: dict, age: timedelta):
        with engine.begin() as conn:
            saved.append(
                conn.execute(
                    text("SELECT id, data, fetched_at FROM raw_snapshots "
                         "WHERE season = :s AND kind = 'bootstrap'"),
                    {"s": SEASON},
                ).all()
            )
            conn.execute(
                text("DELETE FROM raw_snapshots WHERE season = :s AND kind = 'bootstrap'"),
                {"s": SEASON},
            )
            conn.execute(
                text("INSERT INTO raw_snapshots (season, kind, data, fetched_at) "
                     "VALUES (:s, 'bootstrap', CAST(:d AS jsonb), :t)"),
                {"s": SEASON, "d": json.dumps(bootstrap),
                 "t": datetime.now(timezone.utc) - age},
            )
        # The loaders cache snapshots for SNAPSHOT_TTL_SECONDS.
        loaders.load_bootstrap.cache_clear()
        loaders.load_fixtures.cache_clear()

    yield seed

    with engine.begin() as conn:
        conn.execute(
            text("DELETE FROM raw_snapshots WHERE season = :s AND kind = 'bootstrap'"),
            {"s": SEASON},
        )
        for batch in saved:
            for _id, data, fetched_at in batch:
                conn.execute(
                    text("INSERT INTO raw_snapshots (season, kind, data, fetched_at) "
                         "VALUES (:s, 'bootstrap', CAST(:d AS jsonb), :t)"),
                    {"s": SEASON, "d": json.dumps(data), "t": fetched_at},
                )
    loaders.load_bootstrap.cache_clear()
    loaders.load_fixtures.cache_clear()
    engine.dispose()


def _bootstrap(next_deadline: datetime):
    """Minimal bootstrap whose only un-played gameweek has the given deadline."""
    return {
        "events": [
            {"id": 1, "name": "Gameweek 1", "deadline_time": "2026-08-21T17:30:00Z",
             "finished": True, "is_current": False, "is_next": False},
            {"id": 2, "name": "Gameweek 2",
             "deadline_time": next_deadline.strftime("%Y-%m-%dT%H:%M:%SZ"),
             "finished": False, "is_current": False, "is_next": True},
        ],
        "elements": [{"id": 1, "code": 1, "web_name": "Test", "element_type": 1, "team": 1}],
        "teams": [{"id": 1, "name": "Test FC", "short_name": "TST", "code": 1}],
        "element_types": [{"id": 1, "singular_name_short": "GKP"}],
    }


def test_fresh_snapshot_is_not_stale(client, db_with):
    db_with(_bootstrap(datetime.now(timezone.utc) + timedelta(days=3)), age=timedelta(hours=1))

    body = client.get("/api/data-status").json()

    assert body["source"] == "database"
    assert body["stale"] is False, body["reasons"]
    assert body["snapshot_age_hours"] == pytest.approx(1.0, abs=0.2)


def test_deadline_in_the_past_is_stale_even_if_recently_fetched(client, db_with):
    """
    The signal that matters. A snapshot can be minutes old and still describe a
    season that has moved on — which is what makes an age-only check
    insufficient.
    """
    db_with(_bootstrap(datetime.now(timezone.utc) - timedelta(days=2)), age=timedelta(minutes=5))

    body = client.get("/api/data-status").json()

    assert body["stale"] is True
    assert any("in the past" in r for r in body["reasons"])


def test_old_snapshot_is_stale_even_with_a_future_deadline(client, db_with):
    """A cron that stopped days ago, before the next deadline came round."""
    db_with(_bootstrap(datetime.now(timezone.utc) + timedelta(days=3)), age=timedelta(days=5))

    body = client.get("/api/data-status").json()

    assert body["stale"] is True
    assert any("old" in r for r in body["reasons"])


def test_a_malformed_snapshot_falls_back_instead_of_crashing(client, db_with):
    """
    A truncated write or an FPL error page stored verbatim must degrade to the
    on-disk snapshot, not KeyError its way through every endpoint downstream.
    """
    db_with({"events": [], "elements": []}, age=timedelta(minutes=5))

    resp = client.get("/api/data-status")

    assert resp.status_code == 200
    assert resp.json()["source"] == "files"
    # And the rest of the API still serves.
    assert client.get("/api/season-status").status_code == 200
