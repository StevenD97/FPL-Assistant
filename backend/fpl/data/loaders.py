"""
Data loaders: the app's single entry point for bootstrap-static, fixtures, and
gameweek history.

DB-first — each loader reads the latest snapshot from Postgres (see
fpl.data.db.read) and falls back to the on-disk snapshots in backend/data/ if
the DB is empty or unreachable (controlled by settings.allow_file_fallback).
Returns the verbatim FPL structures either way, so downstream code is unchanged.
"""
import json
import os
import time
from functools import wraps

import pandas as pd
import requests

from fpl.config import DATA_DIR, FPL_API_BASE


def ensure_data_fetched():
    """
    Fetch bootstrap-static + fixtures if they're not already cached on disk.
    Needed for deployment: some hosting platforms wipe local disk between
    deploys/restarts, so we can't assume data/ survives - this lets the app
    self-populate on startup instead of requiring a manual fetch step.
    """
    bootstrap_path = f"{DATA_DIR}/bootstrap_static.json"
    fixtures_path = f"{DATA_DIR}/fixtures.json"
    if os.path.exists(bootstrap_path) and os.path.exists(fixtures_path):
        return

    os.makedirs(DATA_DIR, exist_ok=True)
    for url, path in [
        (f"{FPL_API_BASE}/bootstrap-static/", bootstrap_path),
        (f"{FPL_API_BASE}/fixtures/", fixtures_path),
    ]:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        with open(path, "w", encoding="utf-8") as f:
            json.dump(response.json(), f)


def _ttl_cache(seconds):
    """
    Like lru_cache, but entries expire.

    These loaders used to be @lru_cache(maxsize=None), i.e. cached for the
    process's whole lifetime, on the reasoning that "a fresh ingest only takes
    effect on the next deploy anyway". That stopped being true once ingest
    became a scheduled job: without an expiry the cron would refresh the DB
    every hour and the running web process would never notice, serving the
    snapshot it happened to read at boot until someone redeployed.

    Re-reading is a single indexed row from raw_snapshots, so an expiry costs
    little; the cache is still what keeps it off the per-request path.
    """

    def decorate(fn):
        store: dict = {}

        @wraps(fn)
        def wrapper(*args):
            now = time.monotonic()
            cached = store.get(args)
            if cached is not None and now - cached[0] < seconds:
                return cached[1]
            value = fn(*args)
            store[args] = (now, value)
            return value

        wrapper.cache_clear = store.clear
        return wrapper

    return decorate


# Long enough that it stays off the request path, short enough that an hourly
# ingest is visible without a redeploy.
SNAPSHOT_TTL_SECONDS = 900


def _file_fallback_allowed():
    """DB-first; fall back to the on-disk snapshots unless explicitly disabled."""
    try:
        from fpl.config import get_settings

        return get_settings().allow_file_fallback
    except Exception:
        return True


@_ttl_cache(SNAPSHOT_TTL_SECONDS)
def load_bootstrap(filename="bootstrap_static.json"):
    """
    Reads the latest bootstrap snapshot from the DB (raw_snapshots), keyed by
    the season the filename maps to; falls back to the on-disk JSON if the DB
    is empty/unreachable. Returns the verbatim FPL structure either way, so
    downstream code is unchanged. `filename` still selects the season (live
    vs the 2025/26 archive) - see fpl.data.db.read.

    Cached per filename: every predicted-points endpoint loads the same
    bootstrap repeatedly per request - measured ~50-75ms per parse of the
    ~1.4-2.7MB JSON, called 3-5x in a single /api/players request before this
    was cached. Cached with a TTL rather than for the process's lifetime, so
    the scheduled ingest (which runs out-of-process) is picked up without a
    redeploy - see _ttl_cache.
    """
    try:
        from fpl.data.db.read import bootstrap_from_db

        data = bootstrap_from_db(filename)
        if data is not None:
            return data
    except Exception:
        if not _file_fallback_allowed():
            raise
    with open(f"{DATA_DIR}/{filename}", encoding="utf-8") as f:
        return json.load(f)


@_ttl_cache(SNAPSHOT_TTL_SECONDS)
def load_fixtures(filename="fixtures.json"):
    """Latest fixtures snapshot from the DB, falling back to the on-disk JSON. See load_bootstrap."""
    try:
        from fpl.data.db.read import fixtures_from_db

        data = fixtures_from_db(filename)
        if data is not None:
            return data
    except Exception:
        if not _file_fallback_allowed():
            raise
    with open(f"{DATA_DIR}/{filename}", encoding="utf-8") as f:
        return json.load(f)


@_ttl_cache(SNAPSHOT_TTL_SECONDS)
def load_gw_history(season="2025_26"):
    """
    Gameweek-by-gameweek player data (one row per player per fixture). Reads
    from player_gw_stats in the DB, falling back to gw_history_<season>.csv.
    Cached per season since build_chip_strategy() calls compute_player_scores()
    - and therefore this - once per scanned gameweek.
    """
    df = None
    try:
        from fpl.data.db.read import gw_history_from_db

        df = gw_history_from_db(season)
    except Exception:
        df = None
    if df is None:
        if not _file_fallback_allowed():
            raise RuntimeError(f"No gw_history in DB for season {season} and file fallback is disabled")
        df = pd.read_csv(f"{DATA_DIR}/gw_history_{season}.csv")
    # Rest of the codebase (e.g. compute_congestion) treats kickoff times as
    # naive UTC, so normalize regardless of source (CSV has a "Z" suffix; the
    # DB stores naive UTC already - this is a no-op for the latter).
    df["kickoff_time"] = pd.to_datetime(df["kickoff_time"], utc=True).dt.tz_localize(None)
    df["team_id"] = df["team"].map(_team_name_to_id_map(df))
    return df


def load_recent_bootstrap_snapshots(filename="bootstrap_static.json", hours=48):
    """
    [(fetched_at, bootstrap_dict), ...], oldest first - see
    fpl.data.db.read.recent_bootstrap_snapshots for what this actually reads
    (raw_snapshots' full history, not just the latest row). Deliberately
    NOT cached at all, unlike load_bootstrap/load_fixtures above - those cache
    "the latest snapshot" behind a TTL, whereas this function's entire purpose
    is to reflect *how that latest value has been changing*, so caching it
    would silently freeze it at whatever the first call saw.

    No on-disk fallback (unlike load_bootstrap/load_fixtures) - there's
    only ever one bootstrap JSON file on disk per season, not a time
    series of them, so DB-unreachable and DB-has-no-history-yet both just
    return [] here rather than raising - see recent_bootstrap_snapshots'
    docstring for why that's the honest answer, not an error.
    """
    try:
        from fpl.data.db.read import recent_bootstrap_snapshots

        return recent_bootstrap_snapshots(filename, hours=hours)
    except Exception:
        return []


def _team_name_to_id_map(history):
    """
    Builds {team full name -> numeric team id} from the history's own
    fixture/opponent_team columns instead of joining against bootstrap:
    the `team` column is a name string ("Sunderland"), but each row's
    `opponent_team` is the numeric id of the *other* side - so a
    fixture's home-row opponent_team is the away team's id and vice
    versa. Deriving it this way means it doesn't depend on whichever
    bootstrap file happens to be loaded (e.g. a newer season's, with a
    different set of promoted/relegated teams) matching this archive's
    season.
    """
    mapping = {}
    for _, fixture_rows in history.groupby("fixture"):
        home_rows = fixture_rows[fixture_rows["was_home"]]
        away_rows = fixture_rows[~fixture_rows["was_home"]]
        if home_rows.empty or away_rows.empty:
            continue
        mapping[home_rows["team"].iloc[0]] = away_rows["opponent_team"].iloc[0]
        mapping[away_rows["team"].iloc[0]] = home_rows["opponent_team"].iloc[0]
    return mapping
