"""
Reconstruct the app's expected data shapes from the DB.

- bootstrap/fixtures come back byte-identical (stored verbatim in
  raw_snapshots), so the rest of the codebase is unchanged.
- gw history comes back as a DataFrame with the same columns the CSV had.

analysis.py's loaders call these first and fall back to the on-disk files if
the DB is empty or unreachable (controlled by settings.allow_file_fallback).
"""
import pandas as pd
from sqlalchemy import select, text

from db.config import get_settings
from db.models import RawSnapshot
from db.session import SessionLocal, engine

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


def bootstrap_from_db(filename: str):
    return _latest_snapshot(_season_for(filename, _BOOTSTRAP_FILE_TO_SEASON), "bootstrap")


def fixtures_from_db(filename: str):
    return _latest_snapshot(_season_for(filename, _FIXTURES_FILE_TO_SEASON), "fixtures")


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
