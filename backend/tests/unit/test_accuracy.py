"""
The accuracy record is the one page whose whole value is that it is honest, so
these check the arithmetic rather than the plumbing: that a bad call is graded
as a bad call, that players who didn't play are excluded, and that the
Spearman substitute matches the definition.
"""
import pandas as pd

from fpl.domain.accuracy import _pool_categories, _spearman, grade_event, summarise


def _live(points_by_id, minutes=90):
    return {
        "elements": [
            {"id": pid, "stats": {"total_points": pts, "minutes": minutes}}
            for pid, pts in points_by_id.items()
        ]
    }


def test_spearman_matches_the_definition_on_a_known_case():
    # Perfectly reversed order is rho = -1; identical order is +1.
    a = pd.Series([1, 2, 3, 4, 5])
    assert _spearman(a, pd.Series([5, 4, 3, 2, 1])) == -1.0
    assert _spearman(a, pd.Series([10, 20, 30, 40, 50])) == 1.0


def test_spearman_is_none_without_variation():
    a = pd.Series([1, 2, 3])
    assert _spearman(a, pd.Series([7, 7, 7])) is None


def test_a_missed_captain_call_is_graded_as_missed():
    """
    The point of the page. GW1's real top pick scored 2 while someone else
    scored 17; the record has to say so rather than quietly reporting an
    average.
    """
    from fpl.data.loaders import load_bootstrap

    bootstrap = load_bootstrap()
    live_ids = [p["id"] for p in bootstrap["elements"][:40]]
    # Everyone scores 1 except the last player, who scores 20 - so whoever the
    # model picks first, it cannot have picked the actual top scorer unless it
    # happened to pick that one.
    points = {pid: 1 for pid in live_ids}
    points[live_ids[-1]] = 20

    graded = grade_event(1, live=_live(points), bootstrap=bootstrap)
    assert graded is not None
    captain = graded["captain"]
    assert captain["best_actual"] == 20
    assert captain["actual"] <= captain["best_actual"]
    assert captain["rank_of_pick"] >= 1


def test_players_who_did_not_play_are_excluded():
    from fpl.data.loaders import load_bootstrap

    bootstrap = load_bootstrap()
    live_ids = [p["id"] for p in bootstrap["elements"][:30]]
    payload = {
        "elements": [
            # Half the sample never came on: zero points, zero minutes.
            {"id": pid, "stats": {"total_points": 0 if i % 2 else 5, "minutes": 0 if i % 2 else 90}}
            for i, pid in enumerate(live_ids)
        ]
    }
    graded = grade_event(1, live=payload, bootstrap=bootstrap)
    assert graded is not None
    assert graded["players_graded"] == len([i for i in range(len(live_ids)) if i % 2 == 0])


def test_summarise_is_none_with_nothing_graded():
    assert summarise([]) is None


def test_categories_are_graded_against_the_baseline_and_never_include_zeros():
    """
    The page grades only players who appeared, so a Zero - which is defined by
    not appearing - can never show up here. If one ever did, the record would
    be taking credit for correctly predicting that a dropped player scored
    nothing, which is exactly the flattery the page exists to avoid.
    """
    from fpl.data.loaders import load_bootstrap

    bootstrap = load_bootstrap()
    live_ids = [p["id"] for p in bootstrap["elements"][:60]]
    # A spread across the three categories, plus some who never played.
    points = {}
    for i, pid in enumerate(live_ids):
        points[pid] = [0, 3, 9][i % 3]
    payload = {
        "elements": [
            {"id": pid, "stats": {"total_points": pts, "minutes": 0 if i >= 45 else 90}}
            for i, (pid, pts) in enumerate(points.items())
        ]
    }
    history = pd.DataFrame(
        [{"element": pid, "GW": 0, "total_points": 4} for pid in live_ids],
        columns=["element", "GW", "total_points"],
    )
    graded = grade_event(1, live=payload, bootstrap=bootstrap, history=history)

    categories = {row["category"]: row for row in graded["categories"]}
    assert "Zeros" not in categories
    assert set(categories) <= {"Blanks", "Tickers", "Haulers", "All"}
    # Every row carries the bar it is being judged against, not just the score.
    assert all("baseline_rmse" in row for row in graded["categories"])
    assert categories["All"]["n"] == graded["players_graded"]


def test_categories_are_empty_rather_than_compared_against_nothing():
    """
    In the opening gameweek there is no history to average, and the honest
    answer is to report no comparison - not to score the model against a
    column of zeroes and call it a landslide.
    """
    from fpl.data.loaders import load_bootstrap

    bootstrap = load_bootstrap()
    live_ids = [p["id"] for p in bootstrap["elements"][:20]]
    payload = {"elements": [{"id": pid, "stats": {"total_points": 5, "minutes": 90}}
                            for pid in live_ids]}
    empty = pd.DataFrame(columns=["element", "GW", "total_points"])
    graded = grade_event(1, live=payload, bootstrap=bootstrap, history=empty)
    assert graded["categories"] == []


def test_pooling_weights_by_players_not_by_gameweeks():
    """
    A week with sixty Haulers and a week with two should not count equally.
    Pooling through the mean square reproduces the figure you would get from
    scoring both weeks' players together in one pile.
    """
    events = [
        {"categories": [{"category": "Haulers", "n": 1, "rmse": 4.0, "mae": 4.0,
                         "baseline_rmse": 5.0, "baseline_mae": 5.0}]},
        {"categories": [{"category": "Haulers", "n": 3, "rmse": 2.0, "mae": 2.0,
                         "baseline_rmse": 1.0, "baseline_mae": 1.0}]},
    ]
    pooled = {row["category"]: row for row in _pool_categories(events)}["Haulers"]
    assert pooled["n"] == 4
    # sqrt((1*16 + 3*4) / 4) = sqrt(7)
    assert pooled["rmse"] == round(7 ** 0.5, 3)
    assert pooled["mae"] == 2.5


def test_pooling_skips_gameweeks_that_had_no_baseline():
    assert _pool_categories([{"categories": []}, {}]) == []
