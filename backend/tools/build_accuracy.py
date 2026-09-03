"""
Grade every finished gameweek and write data/accuracy.json.

The API will fill in a gameweek or two on demand, but backfilling a season on
someone's page load is not acceptable, so this does the work up front. Run it
after each gameweek finishes - the ingest workflow does - and commit the
result, exactly as the fallback data snapshots are committed.

Run: PYTHONPATH=. python tools/build_accuracy.py  (from the backend/ folder)
"""
import json
import sys

from fpl.data.ingest import client
from fpl.services.accuracy import ACCURACY_FILE, accuracy_report


def main():
    # Straight from FPL, not the on-disk snapshot: the gameweek that just
    # finished is the one worth grading, and a snapshot taken before it ended
    # doesn't know it is over.
    report = accuracy_report(max_new=None, bootstrap=client.get_bootstrap())
    summary = report["summary"]
    if summary is None:
        print("No finished gameweeks yet - nothing to grade.")
        return 0
    print(f"Graded {summary['events_graded']} gameweek(s) -> {ACCURACY_FILE}")
    print(json.dumps(summary, indent=2))
    pending = report["coverage"]["pending"]
    if pending:
        print(f"Still ungraded: {pending}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
