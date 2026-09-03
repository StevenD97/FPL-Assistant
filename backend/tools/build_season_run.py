"""
Replay the model's season and write data/season_run.json.

Run after each gameweek finishes - the ingest workflow does - and commit the
result, the same way the accuracy record and the fallback snapshots are
committed. A gameweek costs one full projection plus one integer program, and
the overall-rank lookup costs a few dozen requests against the Overall table, so
this is firmly a build step rather than something to do on a page load.

Run: PYTHONPATH=. python tools/build_season_run.py  (from the backend/ folder)
"""
import json
import sys

from fpl.data.ingest import client
from fpl.services.season_run import SEASON_RUN_FILE, replay, save_run


def main():
    # Straight from FPL rather than the on-disk snapshot: the gameweek that just
    # finished is the one worth adding, and a snapshot taken before it ended
    # does not know it is over.
    bootstrap = client.get_bootstrap()
    run = replay(bootstrap=bootstrap)
    if not run["gameweeks"]:
        print("No finished gameweeks yet - nothing to replay.")
        return 0

    save_run(run)
    summary = run["summary"]
    print(f"Replayed GW{summary['first_event']}-{summary['last_event']} -> {SEASON_RUN_FILE}")
    print(json.dumps(summary, indent=2))
    if summary["overall_rank"] is None:
        print("Overall rank could not be looked up this run.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
