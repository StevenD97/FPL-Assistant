"""
Freeze the next gameweek's projections before its deadline, and commit them.

The accuracy page grades every finished gameweek by re-predicting it from a
reference date just before that gameweek's deadline. That is honest - the
prediction genuinely uses no data from after the deadline - but it is a
reconstruction rather than a commitment. A reader has to take on faith that
the model was not adjusted in between, and "we could have predicted this" is a
much weaker claim than "we did predict this, on this date, before kick-off,
from this commit".

So this writes the projection out before the deadline and the grader reads it
back afterwards. That is the difference between a forecast and a postdiction,
and it is the whole reason anyone should believe the record.

Runs on a schedule rather than at a known time, because deadlines move: FPL
sets them 90 minutes before the first kick-off of the gameweek, which drifts
across Friday evening, Saturday lunchtime and the occasional Tuesday. So this
runs often, does nothing most of the time, and freezes when the next deadline
falls inside FREEZE_WINDOW_HOURS. It never overwrites an existing file - a
frozen projection that can be rewritten after the fact is worth exactly as
much as no frozen projection at all.

Run with: python -m tools.freeze_projections  (from the backend/ folder)
Re-freeze a file written in error: FREEZE_OVERWRITE=1 python -m tools.freeze_projections
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone

from fpl.config import (
    ARCHIVED_BOOTSTRAP_FILE,
    ARCHIVED_FIXTURES_FILE,
    LIVE_BOOTSTRAP_FILE,
    LIVE_FIXTURES_FILE,
)
from fpl.data.ingest import client
from fpl.domain.projections import PROJECTIONS_DIR, frozen_path
from fpl.model.predict import predict_multi_gw_points
from fpl.model.rules import CROSS_SEASON_HALF_LIFE_DAYS

# How close to a deadline this will freeze. Wide enough that a daily schedule
# cannot miss a gameweek, tight enough that the frozen numbers are the ones the
# site was actually showing while managers were deciding.
FREEZE_WINDOW_HOURS = 30

# Matches fpl.domain.accuracy: a prediction is only honest if it could have
# been made before the deadline.
DEADLINE_MARGIN_MINUTES = 5

# The columns a grade needs, plus the shape of the outcome - frozen too, so
# "39% chance of a haul" is as checkable after the fact as the projection is.
FROZEN_COLUMNS = ["id", "web_name", "team_short", "position", "predicted_points",
                  "haul_probability", "floor", "ceiling"]


def _model_commit():
    """The exact code that produced these numbers, so a grade is falsifiable."""
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except Exception:
        return None


def _next_event(bootstrap):
    upcoming = sorted(
        (
            (e["id"], datetime.strptime(e["deadline_time"], "%Y-%m-%dT%H:%M:%SZ"))
            for e in bootstrap["events"] if not e.get("finished")
        ),
        key=lambda pair: pair[1],
    )
    return upcoming[0] if upcoming else (None, None)


def freeze(now=None, overwrite=False, bootstrap=None):
    """Returns the path written, or None when there was nothing to do."""
    # Naive UTC, matching every other datetime in this codebase (see
    # load_gw_history, which strips tzinfo for exactly this reason).
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    bootstrap = bootstrap or client.get_bootstrap()
    event, deadline = _next_event(bootstrap)
    if event is None:
        print("No unfinished gameweeks - the season is over.")
        return None

    until = deadline - now
    if until < timedelta(0):
        print(f"GW{event}'s deadline has passed - too late to freeze it honestly.")
        return None
    if until > timedelta(hours=FREEZE_WINDOW_HOURS):
        print(f"GW{event} deadline is {until.total_seconds() / 3600:.1f}h away; "
              f"freezing inside {FREEZE_WINDOW_HOURS}h. Nothing to do.")
        return None

    path = frozen_path(event)
    if path.exists() and not overwrite:
        print(f"GW{event} is already frozen at {path} - leaving it alone.")
        return None

    reference_date = deadline - timedelta(minutes=DEADLINE_MARGIN_MINUTES)
    projections = predict_multi_gw_points(
        reference_date, [event],
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )

    payload = {
        "event": event,
        "deadline": deadline.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "frozen_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model_commit": _model_commit(),
        "players": projections[FROZEN_COLUMNS].to_dict(orient="records"),
    }

    PROJECTIONS_DIR.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, sort_keys=True)
    print(f"Froze {len(payload['players'])} projections for GW{event} to {path}, "
          f"{until.total_seconds() / 3600:.1f}h before the deadline.")
    return path


def main():
    freeze(overwrite=os.environ.get("FREEZE_OVERWRITE") == "1")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
