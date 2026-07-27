"""
One-time backfill so the DB starts life with everything the file snapshots
held:

- The archived 2025/26 bootstrap + fixtures JSON -> raw_snapshots (the model
  trains on this season; the numbers are irreplaceable once FPL resets).
- gw_history_2025_26.csv -> player_gw_stats (per-fixture rows, so double
  gameweeks keep both entries).
- The live 2026/27 bootstrap + fixtures -> raw_snapshots (the roster the app
  predicts for).

Idempotent: archive snapshots/rows are skipped if already present.
"""
import json

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from fpl.config import DATA_DIR, get_settings
from fpl.data.db.models import PlayerGwStat, RawSnapshot
from fpl.data.db.session import session_scope
from fpl.data.ingest import pipeline
from fpl.data.ingest.pipeline import _to_float, _to_int

_settings = get_settings()
ARCHIVE = _settings.archive_season

_INT_COLS = pipeline._INT_STATS + [
    "opponent_team", "value", "selected", "transfers_in", "transfers_out", "team_h_score", "team_a_score",
]
_FLOAT_COLS = pipeline._FLOAT_STATS


def _clean_str(v):
    return None if v is None or (isinstance(v, float) and pd.isna(v)) else str(v)


def _snapshot_exists(session, season: str, kind: str) -> bool:
    return session.scalar(
        select(func.count()).select_from(RawSnapshot).where(RawSnapshot.season == season, RawSnapshot.kind == kind)
    ) > 0


def backfill_archive_snapshots() -> None:
    files = {"bootstrap": "bootstrap_static_2025_26_final.json", "fixtures": "fixtures_2025_26_final.json"}
    with session_scope() as session:
        for kind, filename in files.items():
            if _snapshot_exists(session, ARCHIVE, kind):
                print(f"  archive {kind} snapshot already present - skip")
                continue
            data = json.loads((DATA_DIR / filename).read_text(encoding="utf-8"))
            session.add(RawSnapshot(season=ARCHIVE, kind=kind, data=data))
            print(f"  stored archive {kind} snapshot")


def _archive_id_to_code() -> dict[int, int]:
    boot = json.loads((DATA_DIR / "bootstrap_static_2025_26_final.json").read_text(encoding="utf-8"))
    return {el["id"]: el["code"] for el in boot.get("elements", [])}


def backfill_archive_gw_history() -> int:
    with session_scope() as session:
        existing = session.scalar(
            select(func.count()).select_from(PlayerGwStat).where(PlayerGwStat.season == ARCHIVE)
        )
        if existing:
            print(f"  archive gw history already present ({existing} rows) - skip")
            return existing

    df = pd.read_csv(DATA_DIR / "gw_history_2025_26.csv")
    df["kickoff_time"] = pd.to_datetime(df["kickoff_time"], utc=True).dt.tz_localize(None)
    # The source CSV has a handful of exact-duplicate rows (same player, GW and
    # fixture) - drop them so they don't double-count or clash with the key.
    df = df.drop_duplicates(subset=["element", "GW", "fixture"], keep="first")
    id_to_code = _archive_id_to_code()

    records = []
    for r in df.to_dict("records"):
        element = _to_int(r.get("element"))
        rec = {
            "season": ARCHIVE,
            "event": _to_int(r.get("GW")),
            "element": element,
            "element_code": id_to_code.get(element, element),
            "fixture": _to_int(r.get("fixture")) or 0,
            "name": _clean_str(r.get("name")),
            "position": _clean_str(r.get("position")),
            "team": _clean_str(r.get("team")),
            "was_home": None if pd.isna(r.get("was_home")) else bool(r.get("was_home")),
            "kickoff_time": None if pd.isna(r.get("kickoff_time")) else r.get("kickoff_time").to_pydatetime(),
        }
        for c in _INT_COLS:
            rec[c] = _to_int(r.get(c))
        for c in _FLOAT_COLS:
            rec[c] = _to_float(r.get(c))
        records.append(rec)

    # Chunked insert (~30k rows) to keep statements a sane size.
    inserted = 0
    with session_scope() as session:
        for i in range(0, len(records), 1000):
            chunk = records[i : i + 1000]
            stmt = pg_insert(PlayerGwStat).values(chunk).on_conflict_do_nothing(
                constraint="uq_pgs_season_event_element_fixture"
            )
            session.execute(stmt)
            inserted += len(chunk)
    print(f"  inserted {inserted} archive gw-history rows")
    return inserted


def backfill_live_roster() -> None:
    n_boot = pipeline.snapshot_bootstrap(_settings.current_season)
    n_fix = pipeline.snapshot_fixtures(_settings.current_season)
    print(f"  stored live {_settings.current_season} bootstrap ({n_boot} players) + fixtures ({n_fix})")


def run_backfill() -> None:
    print("Backfilling archive snapshots...")
    backfill_archive_snapshots()
    print("Backfilling archive gw history...")
    backfill_archive_gw_history()
    print("Fetching live roster snapshots...")
    backfill_live_roster()
    print("Backfill complete.")
