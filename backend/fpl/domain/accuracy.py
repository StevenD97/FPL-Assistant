"""
How the model actually did.

Every prediction this app makes is a claim, and until now not one of them was
ever checked in public. A number with no track record is a number a reader has
to take on faith, and a reader who has to take it on faith has no reason to
prefer it to their own instinct.

What is graded here is exactly what the product shows: for a finished
gameweek, the model's own ranking of every player, predicted with data
strictly before that gameweek's deadline - no hindsight, no re-fitting - and
what those players then scored, straight from FPL's own results.

Three measures, chosen because a manager can act on them, not because they are
the ones that flatter the model:

  - The captain call. FPL doubles one player, so the single most consequential
    output is "who is the best captain this week". Graded as: what the model's
    top pick actually scored, against what the gameweek's genuine top scorer
    scored, and where the pick finished in the real order.
  - The top ten. What the ten highest-projected players averaged, against the
    average across everyone who played. If the ranking carries no information
    these are the same number.
  - Rank correlation across the whole list (Spearman), which says whether the
    ordering holds up beyond the top of it.

Deliberately not here: any measure computed over players who did not play.
Six hundred zeroes correlate beautifully with six hundred predicted-near-zero
and would make any model look excellent. Everything below is computed over
players who actually appeared.
"""
from datetime import datetime

import pandas as pd

from fpl.config import (
    ARCHIVED_BOOTSTRAP_FILE,
    ARCHIVED_FIXTURES_FILE,
    LIVE_BOOTSTRAP_FILE,
    LIVE_FIXTURES_FILE,
)
from fpl.data.ingest import client
from fpl.data.loaders import load_bootstrap
from fpl.model.predict import predict_multi_gw_points
from fpl.model.rules import CROSS_SEASON_HALF_LIFE_DAYS

TOP_N = 10
# A prediction is only honest if it could have been made before kick-off, so
# every gameweek is predicted from a reference date just before its own
# deadline - the same rule the live endpoints follow.
DEADLINE_MARGIN_MINUTES = 5


def _spearman(a, b):
    """
    Spearman's rho, as Pearson over the ranks.

    pandas' own method="spearman" imports scipy, and scipy is ~90MB of wheel
    for this one number on a free tier that is already tight on both build
    time and disk. Ranking first and taking Pearson is the definition, not an
    approximation - average ranks handle ties, which matter here because a lot
    of players score exactly 1 or 2.
    """
    ranked_a = a.rank(method="average")
    ranked_b = b.rank(method="average")
    if ranked_a.nunique() < 2 or ranked_b.nunique() < 2:
        return None
    return round(float(ranked_a.corr(ranked_b)), 3)


def finished_events(bootstrap=None):
    """Gameweek ids FPL has marked finished, oldest first."""
    bootstrap = bootstrap or load_bootstrap(LIVE_BOOTSTRAP_FILE)
    return [e["id"] for e in bootstrap["events"] if e.get("finished")]


def _reference_date(bootstrap, event):
    deadline = next(
        datetime.strptime(e["deadline_time"], "%Y-%m-%dT%H:%M:%SZ")
        for e in bootstrap["events"] if e["id"] == event
    )
    return deadline - pd.Timedelta(minutes=DEADLINE_MARGIN_MINUTES)


def actual_points(event, live=None):
    """element id -> (points, minutes) for one gameweek, from FPL's own results."""
    live = live or client.get_event_live(event)
    return {
        row["id"]: (row["stats"]["total_points"], row["stats"]["minutes"])
        for row in live["elements"]
    }


def grade_event(event, live=None, bootstrap=None):
    """
    One finished gameweek, graded. Returns None if nobody played in it, which
    is what an unplayed or abandoned gameweek looks like.
    """
    bootstrap = bootstrap or load_bootstrap(LIVE_BOOTSTRAP_FILE)
    reference_date = _reference_date(bootstrap, event)

    predicted = predict_multi_gw_points(
        reference_date, [event],
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )[["id", "web_name", "team_short", "position", "predicted_points"]]

    results = actual_points(event, live)
    predicted["actual_points"] = predicted["id"].map(lambda i: results.get(i, (0, 0))[0])
    predicted["minutes"] = predicted["id"].map(lambda i: results.get(i, (0, 0))[1])

    played = predicted[predicted["minutes"] > 0]
    if played.empty:
        return None

    # Ties broken by id so the same gameweek grades identically on any machine
    # - the same reason fpl.domain.scoring.rank_desc exists.
    ranked = played.sort_values(["predicted_points", "id"], ascending=[False, True])
    top = ranked.head(TOP_N)
    best_actual = played.sort_values(["actual_points", "id"], ascending=[False, True]).iloc[0]
    pick = ranked.iloc[0]

    # Where the model's captain pick finished in the real order (1 = top scorer).
    actual_order = played.sort_values(["actual_points", "id"], ascending=[False, True]).reset_index(drop=True)
    pick_rank = int(actual_order.index[actual_order["id"] == pick["id"]][0]) + 1

    return {
        "event": event,
        "players_graded": int(len(played)),
        "captain": {
            "pick": pick["web_name"],
            "pick_team": pick["team_short"],
            "predicted": round(float(pick["predicted_points"]), 1),
            "actual": int(pick["actual_points"]),
            "best_actual": int(best_actual["actual_points"]),
            "best_actual_player": best_actual["web_name"],
            "rank_of_pick": pick_rank,
        },
        "top_ten": {
            "average_actual": round(float(top["actual_points"].mean()), 2),
            "field_average": round(float(played["actual_points"].mean()), 2),
            "names": top["web_name"].tolist(),
        },
        # Spearman: does the ordering hold, not whether the absolute numbers do.
        # 0 is a coin toss, 1 is a perfect ordering.
        "rank_correlation": _spearman(played["predicted_points"], played["actual_points"]),
    }


def summarise(events):
    """The headline a reader wants first: how it has gone across every graded week."""
    if not events:
        return None
    captain_actual = [e["captain"]["actual"] for e in events]
    captain_best = [e["captain"]["best_actual"] for e in events]
    return {
        "events_graded": len(events),
        "captain_average": round(sum(captain_actual) / len(events), 2),
        "captain_best_possible_average": round(sum(captain_best) / len(events), 2),
        "top_ten_average": round(sum(e["top_ten"]["average_actual"] for e in events) / len(events), 2),
        "field_average": round(sum(e["top_ten"]["field_average"] for e in events) / len(events), 2),
        "rank_correlation": _mean_or_none([e["rank_correlation"] for e in events]),
    }


def _mean_or_none(values):
    present = [v for v in values if v is not None]
    return round(sum(present) / len(present), 3) if present else None
