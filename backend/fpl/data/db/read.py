"""
Reconstruct the app's expected data shapes from the DB.

- bootstrap/fixtures come back byte-identical (stored verbatim in
  raw_snapshots), so the rest of the codebase is unchanged.
- gw history comes back as a DataFrame with the same columns the CSV had.

analysis.py's loaders call these first and fall back to the on-disk files if
the DB is empty or unreachable (controlled by settings.allow_file_fallback).
"""
from datetime import datetime, timedelta, timezone

import pandas as pd
from sqlalchemy import select, text

from fpl.config import get_settings
from fpl.data.db.models import RawSnapshot
from fpl.data.db.session import SessionLocal, engine

_settings = get_settings()

# The codebase selects a season by passing a filename; map those to seasons.
_BOOTSTRAP_FILE_TO_SEASON = {
    "bootstrap_static.json": _settings.current_season,
    "bootstrap_static_2025_26_final.json": _settings.archive_season,
}
_FIXTURES_FILE_TO_SEASON = {
    "fixtures.json": _settings.current_season,
    "fixtures_2025_26_final.json": _settings.archive_season,
}


def _season_for(filename: str, mapping: dict[str, str]) -> str:
    if filename in mapping:
        return mapping[filename]
    # Unknown filename: infer from the archive-season token, else current.
    return _settings.archive_season if _settings.archive_season in filename else _settings.current_season


def _latest_snapshot(season: str, kind: str):
    with SessionLocal() as session:
        return session.scalar(
            select(RawSnapshot.data)
            .where(RawSnapshot.season == season, RawSnapshot.kind == kind)
            .order_by(RawSnapshot.fetched_at.desc())
            .limit(1)
        )


def latest_snapshot_health(filename: str = "bootstrap_static.json"):
    """
    ``(fetched_at, usable)`` for the newest stored bootstrap of this season, or
    ``(None, False)`` if there is no row at all.

    Powers /api/data-status, which has to answer "what is the app actually
    serving?" - and a row being present is not the same as it being served,
    since bootstrap_from_db rejects a malformed one and the loaders then fall
    back to disk. Reporting "database" on the strength of a row that is being
    ignored would misdirect exactly the person debugging an outage.

    Deliberately evaluated in SQL rather than by loading the payload: this
    endpoint is meant to be cheap enough to poll, and the snapshot is ~1.6 MB.
    """
    with SessionLocal() as session:
        row = session.execute(
            text(
                "SELECT fetched_at, "
                "       (jsonb_typeof(data) = 'object' "
                "        AND jsonb_array_length(coalesce(data->'events', '[]'::jsonb)) > 0 "
                "        AND jsonb_array_length(coalesce(data->'elements', '[]'::jsonb)) > 0) "
                "FROM raw_snapshots "
                "WHERE season = :season AND kind = 'bootstrap' "
                "ORDER BY fetched_at DESC LIMIT 1"
            ),
            {"season": _season_for(filename, _BOOTSTRAP_FILE_TO_SEASON)},
        ).first()
    if row is None:
        return None, False
    return row[0], bool(row[1])


def bootstrap_from_db(filename: str):
    """
    Latest stored bootstrap, or None if there isn't a usable one.

    "Usable" is checked rather than assumed: the loaders only fall back to the
    on-disk snapshot when this *raises or returns None*, so a row that is
    present but malformed - a truncated write, or an FPL error page stored
    verbatim as if it were data - would sail through and take out every
    endpoint downstream with a KeyError, instead of degrading to the file
    fallback that exists precisely for this. Cheap shape check, one class of
    silent outage removed.
    """
    data = _latest_snapshot(_season_for(filename, _BOOTSTRAP_FILE_TO_SEASON), "bootstrap")
    if not isinstance(data, dict) or not data.get("events") or not data.get("elements"):
        return None
    return data


def fixtures_from_db(filename: str):
    """Latest stored fixtures, or None if there isn't a usable one - see bootstrap_from_db."""
    data = _latest_snapshot(_season_for(filename, _FIXTURES_FILE_TO_SEASON), "fixtures")
    if not isinstance(data, list) or not data:
        return None
    return data


def gw_history_from_db(season: str):
    """DataFrame with the same columns as gw_history_<season>.csv, or None if empty."""
    with engine.connect() as conn:
        df = pd.read_sql(
            text("SELECT * FROM player_gw_stats WHERE season = :season"),
            conn,
            params={"season": season},
        )
    if df.empty:
        return None
    # DB stores the gameweek as `event`; the CSV called it `GW`.
    return df.rename(columns={"event": "GW"})


def recent_bootstrap_snapshots(filename: str, hours: int = 48):
    """
    (fetched_at, data) tuples for every bootstrap snapshot fetched in the
    last `hours` hours, oldest first - the ingest workflow snapshots
    bootstrap-static every 6 hours (.github/workflows/ingest-data.yml) and
    keeps every fetch as its own raw_snapshots row rather than overwriting
    the latest, so this is genuinely a time series, not just "the last N
    reads of one row". Used by analysis.compute_price_change_signals to see
    whether a player's net-transfer momentum is building or cooling, not
    just its current snapshot value - see that function's docstring.

    Unlike bootstrap_from_db/fixtures_from_db (which fall back to a single
    on-disk JSON file when the DB is empty/unreachable - see this module's
    docstring), there is no on-disk equivalent of a *time series* of past
    snapshots, so this has no file fallback: returns [] whenever the DB is
    unreachable or has fewer than `hours` worth of history yet (e.g. right
    after ingestion first starts running), which callers treat as "no trend
    data yet" rather than an error - the honest answer, not a guess.
    """
    season = _season_for(filename, _BOOTSTRAP_FILE_TO_SEASON)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    try:
        with SessionLocal() as session:
            rows = session.execute(
                select(RawSnapshot.fetched_at, RawSnapshot.data)
                .where(RawSnapshot.season == season, RawSnapshot.kind == "bootstrap", RawSnapshot.fetched_at >= cutoff)
                .order_by(RawSnapshot.fetched_at.asc())
            ).all()
        return [(row.fetched_at, row.data) for row in rows]
    except Exception:
        return []
