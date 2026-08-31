"""
Retention tests for raw_snapshots — the table that filled up and cost this
deployment its database.

These need a real Postgres (the policy is one statement of window functions,
so testing it against anything else would prove nothing). They skip unless
TEST_DATABASE_URL is set; CI provides one via a service container, and locally
`podman compose up -d` plus

    TEST_DATABASE_URL=postgresql+psycopg://fpl:fpl_local_dev@localhost:5432/fpl

runs them. Every test works in its own season string and cleans up after
itself, so pointing this at a database with real data in it is safe.
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set (needs a live Postgres)"
)

# raw_snapshots.season is String(16), so keep these short.
SEASON = "t_retention"
OTHER_SEASON = "t_retention2"
FINE_HOURS = 24 * 7
DAILY_DAYS = 180


@pytest.fixture
def db(monkeypatch):
    """
    Engine bound to TEST_DATABASE_URL, with this season's rows cleared.

    fpl.data.db.session builds its engine at import time, and conftest has
    already pinned DATABASE_URL at an unreachable host by then (that is how the
    golden suite forces the file-fallback path). So rebind the module's engine
    and sessionmaker rather than setting the environment variable and hoping —
    prune_snapshots reaches for session_scope(), which reads them by name.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from fpl.data.db import session as session_mod

    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True, future=True)
    monkeypatch.setattr(session_mod, "engine", engine)
    monkeypatch.setattr(
        session_mod,
        "SessionLocal",
        sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True),
    )

    def clear():
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM raw_snapshots WHERE season = :s"), {"s": SEASON})
            conn.execute(text("DELETE FROM ingest_runs WHERE season = :s"), {"s": SEASON})

    clear()
    yield engine
    clear()
    engine.dispose()


def _seed_hourly(engine, hours: int) -> None:
    """`hours` hourly bootstrap+fixtures snapshots, newest now, oldest hours-1 ago."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO raw_snapshots (season, kind, data, fetched_at) "
                "SELECT :s, k, '{}'::jsonb, now() - make_interval(hours => h) "
                "FROM generate_series(0, :n) AS h, "
                "     unnest(ARRAY['bootstrap','fixtures']) AS k"
            ),
            {"s": SEASON, "n": hours - 1},
        )


def _counts(engine) -> dict:
    with engine.begin() as conn:
        rows = conn.execute(
            text("SELECT kind, count(*) FROM raw_snapshots WHERE season = :s GROUP BY kind"),
            {"s": SEASON},
        ).all()
    return {kind: n for kind, n in rows}


def test_prune_keeps_the_fine_window_intact(db):
    """Everything inside snapshot_fine_hours survives at full hourly resolution —
    that is what price-watch's transfer-rate column reads."""
    from fpl.data.ingest.pipeline import prune_snapshots

    _seed_hourly(db, hours=FINE_HOURS + 24 * 30)
    prune_snapshots(SEASON, fine_hours=FINE_HOURS, daily_days=DAILY_DAYS)

    with db.begin() as conn:
        kept = conn.execute(
            text(
                "SELECT count(*) FROM raw_snapshots "
                "WHERE season = :s AND kind = 'bootstrap' "
                "AND fetched_at > now() - make_interval(hours => :h)"
            ),
            {"s": SEASON, "h": FINE_HOURS},
        ).scalar()
    assert kept == FINE_HOURS, f"expected every hourly row in the fine window, kept {kept}"


def test_prune_thins_older_rows_to_one_per_day(db):
    from fpl.data.ingest.pipeline import prune_snapshots

    _seed_hourly(db, hours=FINE_HOURS + 24 * 30)
    prune_snapshots(SEASON, fine_hours=FINE_HOURS, daily_days=DAILY_DAYS)

    with db.begin() as conn:
        worst = conn.execute(
            text(
                "SELECT coalesce(max(per_day), 0) FROM ("
                "  SELECT count(*) AS per_day FROM raw_snapshots"
                "  WHERE season = :s AND fetched_at < now() - make_interval(hours => :h)"
                "  GROUP BY kind, date_trunc('day', fetched_at AT TIME ZONE 'UTC')) t"
            ),
            {"s": SEASON, "h": FINE_HOURS},
        ).scalar()
    assert worst <= 1, f"outside the fine window at most one snapshot per day, found {worst}"


def test_prune_is_idempotent(db):
    """A cron that re-runs must not keep churning rows."""
    from fpl.data.ingest.pipeline import prune_snapshots

    _seed_hourly(db, hours=FINE_HOURS + 24 * 30)
    prune_snapshots(SEASON, fine_hours=FINE_HOURS, daily_days=DAILY_DAYS)
    after_first = _counts(db)

    second = prune_snapshots(SEASON, fine_hours=FINE_HOURS, daily_days=DAILY_DAYS)

    assert second["deleted"] == 0
    assert _counts(db) == after_first


def test_prune_never_deletes_the_newest_snapshot(db):
    """
    The regression that matters most: if the cron has been dead longer than the
    retention window, every row is expired. Deleting them all would take the
    site down (no snapshot to read); keeping the newest leaves it merely stale.
    """
    from fpl.data.ingest.pipeline import prune_snapshots

    old = datetime.now(timezone.utc) - timedelta(days=400)
    with db.begin() as conn:
        for kind in ("bootstrap", "fixtures"):
            for offset in range(5):
                conn.execute(
                    text(
                        "INSERT INTO raw_snapshots (season, kind, data, fetched_at) "
                        "VALUES (:s, :k, '{}'::jsonb, :t)"
                    ),
                    {"s": SEASON, "k": kind, "t": old + timedelta(days=offset)},
                )

    prune_snapshots(SEASON, fine_hours=FINE_HOURS, daily_days=DAILY_DAYS)

    assert _counts(db) == {"bootstrap": 1, "fixtures": 1}
    with db.begin() as conn:
        newest = conn.execute(
            text("SELECT max(fetched_at) FROM raw_snapshots WHERE season = :s"), {"s": SEASON}
        ).scalar()
    assert newest.date() == (old + timedelta(days=4)).date(), "the surviving row must be the newest"


def test_prune_leaves_other_seasons_alone(db):
    from fpl.data.ingest.pipeline import prune_snapshots

    other = OTHER_SEASON
    with db.begin() as conn:
        conn.execute(text("DELETE FROM raw_snapshots WHERE season = :s"), {"s": other})
        conn.execute(
            text(
                "INSERT INTO raw_snapshots (season, kind, data, fetched_at) "
                "SELECT :s, 'bootstrap', '{}'::jsonb, now() - make_interval(days => d) "
                "FROM generate_series(0, 40) AS d"
            ),
            {"s": other},
        )
    _seed_hourly(db, hours=FINE_HOURS + 24 * 30)

    prune_snapshots(SEASON, fine_hours=FINE_HOURS, daily_days=DAILY_DAYS)

    with db.begin() as conn:
        untouched = conn.execute(
            text("SELECT count(*) FROM raw_snapshots WHERE season = :s"), {"s": other}
        ).scalar()
        conn.execute(text("DELETE FROM raw_snapshots WHERE season = :s"), {"s": other})
    assert untouched == 41, "pruning one season must not touch another's rows"
