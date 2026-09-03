"""
Grading one manager's armband against the model's, for a finished gameweek.

The arithmetic is in fpl.domain.counterfactual; this assembles the three things
it needs - what the model said before the deadline, who the manager actually
captained, and what both scored - and is careful that the first of those is not
quietly reconstructed after the fact.
"""
import logging

from fpl.data.entry import fetch_entry_picks
from fpl.data.loaders import load_bootstrap
from fpl.config import LIVE_BOOTSTRAP_FILE
from fpl.domain.accuracy import actual_points, finished_events
from fpl.domain.counterfactual import captain_counterfactual
from fpl.domain.projections import SOURCE_FROZEN, SOURCE_RECONSTRUCTED, load_frozen

log = logging.getLogger(__name__)


def _model_captain(event, squad_element_ids):
    """
    (pick, source) - the model's top captaincy choice among the players this
    manager actually owned that week, and where that projection came from.

    Ranked within the manager's own squad rather than the whole game, because
    the counterfactual has to be a decision they could have made. "You should
    have captained Haaland" means nothing to someone who does not own him.

    Only the frozen, pre-deadline file is used. Re-predicting the week
    afterwards would still be honest about its inputs, but this number is
    pointed at a specific person's decision and telling them what we "would
    have" said is not the same as telling them what we did say. No freeze, no
    counterfactual.
    """
    frozen = load_frozen(event)
    if frozen is None:
        return None, SOURCE_RECONSTRUCTED
    owned = [p for p in frozen["players"] if p["id"] in squad_element_ids]
    if not owned:
        return None, SOURCE_FROZEN
    # Ties broken by id so the same gameweek grades identically anywhere - the
    # same rule as fpl.domain.scoring.rank_desc.
    best = max(owned, key=lambda p: (p["predicted_points"], -p["id"]))
    return {"id": best["id"], "web_name": best["web_name"]}, SOURCE_FROZEN


def captain_review(team_id, event=None, bootstrap=None):
    """
    How the armband went against the model's pick for the most recent finished
    gameweek (or `event`, if given).

    Returns a dict with `available: False` and a reason rather than raising when
    the comparison cannot be made honestly - no finished gameweek, no frozen
    projection for it, or a manager with no team that week. A page asking this
    question should be able to say why there is no answer.
    """
    bootstrap = bootstrap or load_bootstrap(LIVE_BOOTSTRAP_FILE)
    finished = finished_events(bootstrap)
    if not finished:
        return {"available": False, "reason": "No gameweek has finished yet."}
    event = event if event is not None else finished[-1]

    try:
        picks = fetch_entry_picks(team_id, event)["picks"]
    except Exception:
        log.warning("could not read picks for entry %s in GW%s", team_id, event, exc_info=True)
        return {"available": False, "event": event,
                "reason": f"Couldn't read your team for GW{event}."}

    captained = next((p for p in picks if p.get("multiplier", 0) >= 2), None)
    if captained is None:
        return {"available": False, "event": event,
                "reason": f"No captain found in your GW{event} team."}

    owned = {p["element"] for p in picks}
    model_pick, source = _model_captain(event, owned)
    if model_pick is None:
        return {
            "available": False,
            "event": event,
            "reason": (
                f"GW{event}'s projections weren't frozen before the deadline, so there is "
                "nothing to hold ourselves to. Weeks from here on will have one."
            ),
        }

    results = actual_points(event)
    points = {element: pts for element, (pts, _minutes) in results.items()}
    names = {p["id"]: p["web_name"] for p in bootstrap["elements"]}
    actual_pick = {"id": captained["element"],
                   "web_name": names.get(captained["element"], "your captain")}

    review = captain_counterfactual(
        model_pick, actual_pick, points, multiplier=int(captained.get("multiplier", 2)))
    if review is None:
        return {"available": False, "event": event,
                "reason": f"Couldn't score both captains for GW{event}."}

    return {"available": True, "event": event, "source": source, **review}
