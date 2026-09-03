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
  - Error by return category, against the bar anyone could clear without a
    model at all: predict that a player scores what they averaged over their
    last five matches. Splitting by what actually happened is the only way to
    see whether a model knows who will haul or merely knows who will blank,
    and the two are worth very different amounts to a manager. See
    fpl.domain.baseline for where the categories and the bar come from.

Deliberately not here: any measure computed over players who did not play.
Six hundred zeroes correlate beautifully with six hundred predicted-near-zero
and would make any model look excellent. Everything below is computed over
players who actually appeared - which is also why the categories reported here
are Blanks, Tickers and Haulers but never Zeros: a Zero is by definition
someone who did not play, so grading one here would be grading the thing this
page refuses to take credit for.
"""
import logging
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
from fpl.domain.baseline import LAST_N_MATCHES, categorise, last_n_baseline, score_by_category
from fpl.domain.projections import SOURCE_FROZEN, SOURCE_RECONSTRUCTED, load_frozen
from fpl.model.predict import predict_multi_gw_points
from fpl.model.rules import CROSS_SEASON_HALF_LIFE_DAYS

log = logging.getLogger(__name__)

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


def baseline_history(event, bootstrap=None, lookback=LAST_N_MATCHES):
    """
    The gameweeks just before `event`, as a frame the last-five baseline can
    read: one row per player per gameweek, with what they actually scored.

    Only `lookback` gameweeks are fetched, because that is all the baseline
    looks at - it takes the last five appearances and nothing earlier. Pulling
    the whole season to compute a five-week average would cost thirty-odd API
    calls to reach the same number.

    A gameweek that cannot be fetched is skipped rather than fatal. The
    baseline is a comparison, not a projection: a slightly shorter window makes
    it a marginally different bar, while failing the whole grading because one
    historical gameweek 404'd would lose the model's own record too.
    """
    bootstrap = bootstrap or load_bootstrap(LIVE_BOOTSTRAP_FILE)
    previous = [e for e in finished_events(bootstrap) if e < event][-lookback:]
    rows = []
    for earlier in previous:
        try:
            results = actual_points(earlier)
        except Exception:
            log.warning("could not read GW%s for the baseline", earlier, exc_info=True)
            continue
        rows.extend(
            {"element": element, "GW": earlier, "total_points": points}
            for element, (points, _minutes) in results.items()
        )
    return pd.DataFrame(rows, columns=["element", "GW", "total_points"])


def grade_event(event, live=None, bootstrap=None, history=None):
    """
    One finished gameweek, graded. Returns None if nobody played in it, which
    is what an unplayed or abandoned gameweek looks like.

    `history` is the prior-gameweeks frame the last-five baseline is computed
    from; it is a parameter rather than a fetch so a caller grading several
    gameweeks pays for it once, and so the tests can hand in a fixture instead
    of the internet.
    """
    bootstrap = bootstrap or load_bootstrap(LIVE_BOOTSTRAP_FILE)
    predicted, source, frozen_at = _projections_for(event, bootstrap)

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
        "categories": _grade_categories(played, event, history, bootstrap),
        "event": event,
        # Where the predictions came from. A gameweek frozen before its
        # deadline is a pre-commitment; one reconstructed afterwards is an
        # honest re-run that a reader is entitled to trust less. Saying which
        # is the difference between a track record and an assertion.
        "source": source,
        "frozen_at": frozen_at,
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


def _projections_for(event, bootstrap):
    """
    (frame, source, frozen_at) for one gameweek.

    Prefers the file written before the deadline. Falls back to re-predicting
    from a reference date just before it - which uses no post-deadline data
    and is a fair reconstruction, but is not a commitment, and is labelled so.
    """
    frozen = load_frozen(event)
    if frozen is not None:
        frame = pd.DataFrame(frozen["players"])
        columns = [c for c in ("id", "web_name", "team_short", "position", "predicted_points")
                   if c in frame.columns]
        return frame[columns], SOURCE_FROZEN, frozen.get("frozen_at")

    reference_date = _reference_date(bootstrap, event)
    frame = predict_multi_gw_points(
        reference_date, [event],
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )[["id", "web_name", "team_short", "position", "predicted_points"]]
    return frame, SOURCE_RECONSTRUCTED, None


def _grade_categories(played, event, history, bootstrap):
    """
    Error within each return category, model against baseline.

    Returns an empty list when there is no prior history to build a baseline
    from - the opening gameweeks of a season - rather than comparing the model
    against a column of zeroes and declaring a landslide.
    """
    if history is None:
        history = baseline_history(event, bootstrap)
    if history.empty:
        return []
    baseline = last_n_baseline(history, event)
    if not baseline:
        return []

    scored = played.copy()
    scored["baseline_points"] = scored["id"].map(baseline).fillna(0.0)
    scored["category"] = [
        categorise(points, minutes)
        for points, minutes in zip(scored["actual_points"], scored["minutes"])
    ]
    model = {row["category"]: row for row in score_by_category(scored)}
    bar = {row["category"]: row for row in score_by_category(scored, predicted="baseline_points")}
    return [
        {**model[name], "baseline_rmse": bar[name]["rmse"], "baseline_mae": bar[name]["mae"]}
        for name in model
    ]


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
        "categories": _pool_categories(events),
        # How much of the record is a pre-commitment rather than a re-run.
        # A reader deciding how much to trust this page should not have to
        # count the badges themselves.
        "events_frozen": sum(1 for e in events if e.get("source") == SOURCE_FROZEN),
    }


def _pool_categories(events):
    """
    Category errors across every graded gameweek, weighted by how many players
    each week contributed.

    Weighting matters: a gameweek with eleven Haulers and one with sixty should
    not count equally toward the Haulers figure, and averaging the per-week
    RMSEs would let a quiet week drag the number around. RMSE pools through the
    mean square, not the mean, so the squares are recombined before the root.
    """
    pooled = {}
    for event in events:
        for row in event.get("categories") or []:
            bucket = pooled.setdefault(row["category"], {"n": 0, "sq": 0.0, "abs": 0.0,
                                                         "baseline_sq": 0.0, "baseline_abs": 0.0})
            bucket["n"] += row["n"]
            bucket["sq"] += row["rmse"] ** 2 * row["n"]
            bucket["abs"] += row["mae"] * row["n"]
            bucket["baseline_sq"] += row["baseline_rmse"] ** 2 * row["n"]
            bucket["baseline_abs"] += row["baseline_mae"] * row["n"]
    order = ("Blanks", "Tickers", "Haulers", "All")
    return [
        {
            "category": name,
            "n": pooled[name]["n"],
            "rmse": round((pooled[name]["sq"] / pooled[name]["n"]) ** 0.5, 3),
            "mae": round(pooled[name]["abs"] / pooled[name]["n"], 3),
            "baseline_rmse": round((pooled[name]["baseline_sq"] / pooled[name]["n"]) ** 0.5, 3),
            "baseline_mae": round(pooled[name]["baseline_abs"] / pooled[name]["n"], 3),
        }
        for name in order if pooled.get(name, {}).get("n")
    ]


def _mean_or_none(values):
    present = [v for v in values if v is not None]
    return round(sum(present) / len(present), 3) if present else None
