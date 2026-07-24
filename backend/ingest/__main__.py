"""
Ingestion CLI.

  python -m ingest backfill          # one-time load of archive + live snapshots
  python -m ingest run [--season ..] # snapshot bootstrap+fixtures, ingest new finished GWs
  python -m ingest snapshot          # just refresh bootstrap+fixtures snapshots
  python -m ingest live              # just ingest any newly-finished gameweeks
  python -m ingest status            # row counts + recent ingest runs
"""
import argparse

from sqlalchemy import func, select

from db.config import get_settings
from db.models import IngestRun, PlayerGwStat, RawSnapshot
from db.session import session_scope
from ingest import backfill as backfill_mod
from ingest import pipeline


def _status() -> None:
    with session_scope() as session:
        snaps = session.execute(
            select(RawSnapshot.season, RawSnapshot.kind, func.count(), func.max(RawSnapshot.fetched_at))
            .group_by(RawSnapshot.season, RawSnapshot.kind)
            .order_by(RawSnapshot.season, RawSnapshot.kind)
        ).all()
        print("raw_snapshots:")
        for season, kind, n, latest in snaps:
            print(f"  {season:8} {kind:10} {n:>3} snapshots (latest {latest:%Y-%m-%d %H:%M})")

        stats = session.execute(
            select(PlayerGwStat.season, func.count(), func.count(func.distinct(PlayerGwStat.event)))
            .group_by(PlayerGwStat.season)
            .order_by(PlayerGwStat.season)
        ).all()
        print("player_gw_stats:")
        for season, n, gws in stats:
            print(f"  {season:8} {n:>6} rows across {gws} gameweeks")

        runs = session.execute(
            select(IngestRun.kind, IngestRun.season, IngestRun.event, IngestRun.status, IngestRun.rows, IngestRun.started_at)
            .order_by(IngestRun.started_at.desc())
            .limit(8)
        ).all()
        print("recent ingest_runs:")
        for kind, season, event, status, rows, started in runs:
            ev = f"GW{event}" if event is not None else "-"
            print(f"  {started:%Y-%m-%d %H:%M} {kind:9} {season or '-':8} {ev:5} {status:6} {rows} rows")


def main() -> None:
    parser = argparse.ArgumentParser(prog="ingest", description="FPL -> Postgres ingestion")
    parser.add_argument("command", choices=["backfill", "run", "snapshot", "live", "status"])
    parser.add_argument("--season", default=None, help="override season (defaults to current_season)")
    args = parser.parse_args()

    if args.command == "backfill":
        backfill_mod.run_backfill()
    elif args.command == "run":
        print(pipeline.run_ingest(args.season))
    elif args.command == "snapshot":
        season = args.season or get_settings().current_season
        pipeline.snapshot_bootstrap(season)
        pipeline.snapshot_fixtures(season)
        print(f"snapshots refreshed for {season}")
    elif args.command == "live":
        print(pipeline.ingest_new_finished_gws(args.season))
    elif args.command == "status":
        _status()


if __name__ == "__main__":
    main()
