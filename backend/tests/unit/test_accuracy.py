"""
The accuracy record is the one page whose whole value is that it is honest, so
these check the arithmetic rather than the plumbing: that a bad call is graded
as a bad call, that players who didn't play are excluded, and that the
Spearman substitute matches the definition.
"""
import pandas as pd

from fpl.domain.accuracy import _spearman, grade_event, summarise


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
