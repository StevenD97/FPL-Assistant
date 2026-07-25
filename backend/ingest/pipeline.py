"""
FPL -> Postgres ingestion.

- Bootstrap and fixtures are stored verbatim in raw_snapshots (one row per
  fetch). The app reconstructs load_bootstrap()/load_fixtures() from the most
  recent snapshot, so it sees the exact FPL structure.
- Per-gameweek player stats are normalized into player_gw_stats via idempotent
  upserts, so re-running an ingest never duplicates rows.
- ingest_new_finished_gws() diffs FPL's finished events against what's already
  stored - that's the "after each game is played" trigger.
"""
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import distinct, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from db.config import get_settings
from db.models import IngestRun, PlayerGwStat, RawSnapshot
from db.session import session_scope
from ingest import client

_settings = get_settings()

# Live-endpoint stat keys grouped by type for coercion.
_INT_STATS = [
    "minutes", "starts", "total_points", "bonus", "bps", "goals_scored", "assists",
    "clean_sheets", "goals_conceded", "own_goals", "penalties_saved", "penalties_missed",
    "yellow_cards", "red_cards", "saves", "clearances_blocks_interceptions", "recoveries",
    "tackles", "defensive_contribution",
]
_FLOAT_STATS = [
    "influence", "creativity", "threat", "ict_index", "expected_goals", "expected_assists",
    "expected_goal_involvements", "expected_goals_conceded",
]
# Columns updated on conflict (everything except the id + conflict key).
_UPSERT_COLS = [
    "element_code", "name", "position", "team", "opponent_team", "was_home", "kickoff_time",
    "team_h_score", "team_a_score", *_INT_STATS, *_FLOAT_STATS, "value", "selected",
    "transfers_in", "transfers_out",
]


def _to_int(v):
    try:
        return int(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def _to_float(v):
    try:
        return float(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


# --- audit -----------------------------------------------------------------

def _start_run(session: Session, kind: str, season: str | None, event: int | None = None) -> IngestRun:
    run = IngestRun(kind=kind, season=season, event=event, status="running")
    session.add(run)
    session.flush()
    return run


def _finish_run(run: IngestRun, status: str, rows: int = 0, error: str | None = None) -> None:
    run.status = status
    run.rows = rows
    run.error = error
    run.finished_at = datetime.now(timezone.utc)


# --- snapshots --------------------------------------------------------------

def latest_snapshot(session: Session, season: str, kind: str):
    stmt = (
        select(RawSnapshot.data)
        .where(RawSnapshot.season == season, RawSnapshot.kind == kind)
        .order_by(RawSnapshot.fetched_at.desc())
        .limit(1)
    )
    return session.scalar(stmt)


def snapshot_bootstrap(season: str | None = None) -> int:
    season = season or _settings.current_season
    data = client.get_bootstrap()
    with session_scope() as session:
        run = _start_run(session, "bootstrap", season)
        try:
            session.add(RawSnapshot(season=season, kind="bootstrap", data=data))
            n = len(data.get("elements", []))
            _finish_run(run, "ok", rows=n)
            return n
        except Exception as exc:  # noqa: BLE001 - recorded then re-raised
            _finish_run(run, "error", error=str(exc))
            raise


def snapshot_fixtures(season: str | None = None) -> int:
    season = season or _settings.current_season
    data = client.get_fixtures()
    with session_scope() as session:
        run = _start_run(session, "fixtures", season)
        try:
            session.add(RawSnapshot(season=season, kind="fixtures", data=data))
            _finish_run(run, "ok", rows=len(data))
            return len(data)
        except Exception as exc:  # noqa: BLE001
            _finish_run(run, "error", error=str(exc))
            raise


# --- live gameweek stats ----------------------------------------------------

def _bootstrap_maps(bootstrap: dict) -> dict:
    positions = {et["id"]: et["singular_name_short"] for et in bootstrap.get("element_types", [])}
    teams = {t["id"]: t["short_name"] for t in bootstrap.get("teams", [])}
    elements = {}
    for el in bootstrap.get("elements", []):
        elements[el["id"]] = {
            "code": el["code"],
            "name": el.get("web_name"),
            "position": positions.get(el.get("element_type")),
            "team": teams.get(el.get("team")),
            "team_id": el.get("team"),
            "value": el.get("now_cost"),
        }
    return elements


def _team_event_fixture(fixtures: list, team_id: int, event: int):
    """First fixture a team plays in an event: (fixture_id, opponent_id, was_home, kickoff, team_h_score, team_a_score).
    fixture_id is FPL's own real, season-unique fixture id - callers must use
    it (not a placeholder) so per-match dedup/grouping elsewhere (team_model's
    compute_team_goal_strengths, analysis._team_name_to_id_map) stays valid
    once live rows are mixed with archived ones. Returns None for a team with
    no fixture in this event (a blank gameweek)."""
    for fx in fixtures:
        if fx.get("event") != event:
            continue
        h, a = fx.get("team_h_score"), fx.get("team_a_score")
        if fx.get("team_h") == team_id:
            return fx.get("id"), fx.get("team_a"), True, fx.get("kickoff_time"), h, a
        if fx.get("team_a") == team_id:
            return fx.get("id"), fx.get("team_h"), False, fx.get("kickoff_time"), h, a
    return None, None, None, None, None, None


def _parse_kickoff(value):
    if not value:
        return None
    # Store naive UTC to match the rest of the codebase (see load_gw_history).
    return pd.to_datetime(value, utc=True).tz_localize(None).to_pydatetime()


def ingest_event_live(session: Session, season: str, event: int, bootstrap: dict, fixtures: list) -> int:
    """Upsert one aggregated row per player for a (finished) gameweek."""
    elements = _bootstrap_maps(bootstrap)
    live = client.get_event_live(event)
    rows = []
    for entry in live.get("elements", []):
        elem_id = entry["id"]
        meta = elements.get(elem_id)
        if meta is None:
            continue
        stats = entry.get("stats", {})
        fixture_id, opponent, was_home, kickoff, h_score, a_score = _team_event_fixture(fixtures, meta["team_id"], event)
        row = {
            # fixture_id is None for a genuine blank gameweek (this team has no
            # fixture in `event`) - 0 there matches the column's existing
            # "no real fixture" sentinel, and is safe because a blank row never
            # carries goals/opponent data that per-fixture dedup needs to
            # distinguish from another blank in a different event.
            "season": season, "event": event, "element": elem_id, "fixture": fixture_id or 0,
            "element_code": meta["code"], "name": meta["name"], "position": meta["position"],
            "team": meta["team"], "opponent_team": opponent, "was_home": was_home,
            "kickoff_time": _parse_kickoff(kickoff), "team_h_score": h_score, "team_a_score": a_score,
            "value": meta["value"], "selected": None, "transfers_in": None, "transfers_out": None,
        }
        for k in _INT_STATS:
            row[k] = _to_int(stats.get(k))
        for k in _FLOAT_STATS:
            row[k] = _to_float(stats.get(k))
        rows.append(row)

    if not rows:
        return 0
    stmt = pg_insert(PlayerGwStat).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_pgs_season_event_element_fixture",
        set_={c: stmt.excluded[c] for c in _UPSERT_COLS},
    )
    session.execute(stmt)
    return len(rows)


def _finished_events(bootstrap: dict) -> list[int]:
    return [e["id"] for e in bootstrap.get("events", []) if e.get("finished")]


def _ingested_events(session: Session, season: str) -> set[int]:
    stmt = select(distinct(PlayerGwStat.event)).where(PlayerGwStat.season == season)
    return set(session.scalars(stmt).all())


def ingest_new_finished_gws(season: str | None = None) -> dict:
    """Ingest live stats for any finished gameweek not already stored."""
    season = season or _settings.current_season
    summary = {"season": season, "events_ingested": [], "rows": 0}
    with session_scope() as session:
        bootstrap = latest_snapshot(session, season, "bootstrap")
        fixtures = latest_snapshot(session, season, "fixtures")
        if bootstrap is None or fixtures is None:
            raise RuntimeError(f"No bootstrap/fixtures snapshot for {season}; run snapshots first.")

        todo = sorted(set(_finished_events(bootstrap)) - _ingested_events(session, season))
        for event in todo:
            run = _start_run(session, "live", season, event)
            try:
                n = ingest_event_live(session, season, event, bootstrap, fixtures)
                _finish_run(run, "ok", rows=n)
                summary["events_ingested"].append(event)
                summary["rows"] += n
            except Exception as exc:  # noqa: BLE001
                _finish_run(run, "error", error=str(exc))
                raise
    return summary


def run_ingest(season: str | None = None) -> dict:
    """Full refresh: snapshot bootstrap + fixtures, then ingest new finished GWs."""
    season = season or _settings.current_season
    snapshot_bootstrap(season)
    snapshot_fixtures(season)
    return ingest_new_finished_gws(season)
