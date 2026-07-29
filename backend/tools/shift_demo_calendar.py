"""
One-off data edit for the demo branch: shifts GW15 onward's calendar (both
bootstrap events[].deadline_time and fixtures.json kickoff_time) by a
constant offset so the *next* deadline lands close to whenever the demo is
actually being reviewed, instead of the real 2026/27 calendar's December
dates. Without this, the countdown/deadline widgets a visitor sees first
would read "135 days" despite the squad claiming GW14 has already been
played - undermining the "season in progress" illusion the whole demo
depends on. GW1-14 (already marked finished - see build_demo_squad.py's
sibling event-flag edit) are left untouched; nothing reads their deadline_time
once they're no longer the "current"/"next" event.

Not part of the running app - run once, edits data/bootstrap_static.json and
data/fixtures.json in place.

Run: python tools/shift_demo_calendar.py
"""
import json
from datetime import datetime, timedelta

from fpl.config import DATA_DIR

FIRST_LIVE_EVENT = 15
# How many days from "today" GW15's deadline should land - close enough to
# feel live for the whole review window, far enough to not be imminent.
TARGET_DAYS_FROM_NOW = 10


def parse(ts):
    return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ")


def fmt(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def build():
    bootstrap_path = DATA_DIR / "bootstrap_static.json"
    fixtures_path = DATA_DIR / "fixtures.json"

    with open(bootstrap_path) as f:
        bootstrap = json.load(f)

    events_by_id = {e["id"]: e for e in bootstrap["events"]}
    gw15_deadline = parse(events_by_id[FIRST_LIVE_EVENT]["deadline_time"])
    target = datetime.utcnow().replace(minute=0, second=0, microsecond=0) + timedelta(days=TARGET_DAYS_FROM_NOW)
    offset = target - gw15_deadline
    print(f"gw15 deadline {gw15_deadline} -> {gw15_deadline + offset} (offset {offset})")

    shifted = 0
    for e in bootstrap["events"]:
        if e["id"] >= FIRST_LIVE_EVENT:
            e["deadline_time"] = fmt(parse(e["deadline_time"]) + offset)
            shifted += 1
    with open(bootstrap_path, "w") as f:
        json.dump(bootstrap, f, separators=(",", ":"))
    print(f"shifted {shifted} bootstrap events")

    with open(fixtures_path) as f:
        fixtures = json.load(f)
    shifted_fx = 0
    for fx in fixtures:
        if fx.get("event") is not None and fx["event"] >= FIRST_LIVE_EVENT and fx.get("kickoff_time"):
            fx["kickoff_time"] = fmt(parse(fx["kickoff_time"]) + offset)
            shifted_fx += 1
    with open(fixtures_path, "w") as f:
        json.dump(fixtures, f, separators=(",", ":"))
    print(f"shifted {shifted_fx} fixtures")


if __name__ == "__main__":
    build()
