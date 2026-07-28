"""
Gameweek context: "what gameweek is it right now" and blank/double gameweek
detection, both derived from the live bootstrap's events[] rather than any
hardcoded calendar.
"""
from datetime import datetime, timedelta

from fpl.data.loaders import load_bootstrap, load_fixtures
from fpl.domain.fixtures import build_fixtures_by_team_event


def get_gw_context(bootstrap=None):
    """
    Single source of truth for "what gameweek is it right now", derived
    from the live bootstrap's events[] (is_current/is_next/finished flags),
    instead of hardcoded reference-date/event pairs.

    Returns:
      - next_deadline: that gameweek's own deadline_time, verbatim from
        FPL (UTC, "...Z"). Exposed so the frontend's countdown reads the
        real deadline instead of assuming one - FPL does not always set it
        ~90 minutes before the first kickoff, and 2026/27 GW1 is 17:30Z,
        not the 10:30Z that assumption produced.
      - next_event: the upcoming gameweek to predict for - events[].is_next
        if one exists (mid-season, or pre-season with GW1 still ahead), else
        the in-progress is_current gameweek (last GW of the season, no
        "next" one), else the final gameweek id if the whole season has
        finished (nothing left to predict, so pin to the last one rather
        than error).
      - reference_date: a UTC datetime guaranteed strictly before
        next_event's deadline (a few minutes before it) - safe to hand to
        every recency-weighted prediction function as "now", with no
        lookahead into that gameweek's own results.
      - is_preseason: True until FPL marks any gameweek `finished` this
        season - i.e. before 2026/27 GW1 has actually been played. Callers
        use this to decide whether archived-only training is still
        appropriate or whether live gw_history has real signal to blend in.

    Cheap: only reads the already-cached bootstrap (see load_bootstrap),
    not called per-player - safe to call once per request.
    """
    if bootstrap is None:
        bootstrap = load_bootstrap()
    events = bootstrap["events"]
    current = next((e for e in events if e["is_current"]), None)
    upcoming = next((e for e in events if e["is_next"]), None)
    any_finished = any(e["finished"] for e in events)

    if upcoming is not None:
        reference = upcoming
        reference_date = datetime.strptime(reference["deadline_time"], "%Y-%m-%dT%H:%M:%SZ") - timedelta(minutes=5)
    elif current is not None:
        reference = current
        reference_date = datetime.strptime(reference["deadline_time"], "%Y-%m-%dT%H:%M:%SZ")
    else:
        reference = max(events, key=lambda e: e["id"])
        reference_date = datetime.strptime(reference["deadline_time"], "%Y-%m-%dT%H:%M:%SZ")

    return {
        "next_event": reference["id"],
        "next_deadline": reference["deadline_time"],
        "reference_date": reference_date,
        "is_preseason": not any_finished,
    }


def detect_blank_double_gameweeks(bootstrap=None, fixtures=None):
    bootstrap = bootstrap or load_bootstrap()
    fixtures = fixtures or load_fixtures()
    teams = {t["id"]: t["short_name"] for t in bootstrap["teams"]}
    fixtures_by_team_event = build_fixtures_by_team_event(fixtures)
    all_events = sorted({e["id"] for e in bootstrap["events"]})

    blanks = []
    doubles = []
    for team_id, short_name in teams.items():
        for event in all_events:
            count = len(fixtures_by_team_event[team_id].get(event, []))
            if count == 0:
                blanks.append((event, short_name))
            elif count >= 2:
                doubles.append((event, short_name, count))
    return blanks, doubles
