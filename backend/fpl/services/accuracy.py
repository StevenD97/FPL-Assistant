"""
The public accuracy record: grade every finished gameweek once, keep the
result, serve it.

Grading is not cheap - each gameweek is predicted from its own deadline, and
each distinct reference date means a fresh prediction context - so it is done
once per gameweek and persisted, not recomputed per request. By the end of a
season that is 38 contexts; nobody should ever wait for that.

The store is a JSON file next to the data snapshots, for the same reasons
those exist: it works with or without a database, it is readable in a diff,
and a scheduled job can refresh and commit it (see
tools/build_accuracy.py). A request will fill in a small number of missing
gameweeks itself so the page is never stale just because the job hasn't run,
but it will not backfill a whole season on someone's page load.
"""
import json
import logging
from pathlib import Path

from fpl.config import DATA_DIR
from fpl.data.loaders import load_bootstrap
from fpl.config import LIVE_BOOTSTRAP_FILE
from fpl.domain.accuracy import baseline_history, finished_events, grade_event, summarise
from fpl.domain.projections import SOURCE_RECONSTRUCTED

log = logging.getLogger(__name__)

ACCURACY_FILE = Path(DATA_DIR) / "accuracy.json"

# How many un-graded gameweeks a single request will grade before giving up
# and serving what it has. Each one costs a prediction context; two is a
# gameweek's worth of catch-up, which is all a request should ever do.
MAX_GRADED_PER_REQUEST = 2


def _read_store():
    try:
        with open(ACCURACY_FILE, encoding="utf-8") as f:
            data = json.load(f)
        store = {int(k): v for k, v in data.get("events", {}).items()}
    except (FileNotFoundError, json.JSONDecodeError, ValueError, AttributeError):
        return {}
    # Grades written before freezing existed were all reconstructions, so say
    # so rather than leaving the field absent and letting the page guess.
    for graded in store.values():
        graded.setdefault("source", SOURCE_RECONSTRUCTED)
        graded.setdefault("frozen_at", None)
    return store


def _write_store(graded_by_event):
    try:
        ACCURACY_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(ACCURACY_FILE, "w", encoding="utf-8") as f:
            json.dump({"events": {str(k): v for k, v in sorted(graded_by_event.items())}}, f, indent=1)
    except OSError:
        # A read-only or full filesystem must not break the endpoint; the
        # grades are still correct, they just won't survive this container.
        log.warning("could not persist the accuracy store at %s", ACCURACY_FILE, exc_info=True)


def accuracy_report(max_new=MAX_GRADED_PER_REQUEST, bootstrap=None):
    """
    Every finished gameweek, graded, newest first, with a headline summary.

    `max_new` bounds how much grading this call will do; pass None for no
    bound (tools/build_accuracy.py does).

    `bootstrap` overrides where the finished/deadline flags come from. The
    default - the same snapshot every endpoint reads - is right for a request.
    The build tool passes a freshly-fetched one, because a gameweek FPL
    finished an hour ago is not marked finished in a snapshot taken before it
    ended, and that gameweek is exactly the one worth grading.
    """
    bootstrap = bootstrap or load_bootstrap(LIVE_BOOTSTRAP_FILE)
    store = _read_store()
    events = finished_events(bootstrap)

    missing = [e for e in events if e not in store]
    to_grade = missing if max_new is None else missing[:max_new]
    graded_now = 0
    for event in to_grade:
        try:
            # Fetched per gameweek rather than once for the batch: the baseline
            # window slides, so GW9 and GW10 do not read the same five weeks.
            history = baseline_history(event, bootstrap=bootstrap)
            result = grade_event(event, bootstrap=bootstrap, history=history)
        except Exception:
            # One unreachable gameweek shouldn't hide the rest of the record.
            log.warning("could not grade GW%s", event, exc_info=True)
            continue
        if result is not None:
            store[event] = result
            graded_now += 1

    if graded_now:
        _write_store(store)

    # Everything ever graded, not just what this snapshot calls finished. A
    # gameweek only enters the store once FPL has marked it over, so a stored
    # grade is always legitimate - and dropping it because the on-disk
    # snapshot is an hour behind the API would make the record flicker.
    in_order = [store[e] for e in sorted(store)]
    return {
        "summary": summarise(in_order),
        "events": list(reversed(in_order)),
        # Honest about its own completeness: a reader can see that GW7 is
        # finished but not yet graded, rather than assuming it was skipped.
        # The two lists live together under `coverage` rather than beside
        # `events` because they are the same kind of thing - gameweek numbers -
        # and neither is the graded rows.
        "coverage": {
            "graded": sorted(store),
            "pending": [e for e in events if e not in store],
        },
    }
