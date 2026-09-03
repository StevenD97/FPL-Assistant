"""
The multi-gameweek solver is only worth having if it does the things a
per-week solve cannot: roll a free transfer, pay for a hit out of the weeks
that follow it, and not churn a player it just bought. Each of those is a
constraint, and each is tested on a pool small enough to reason about by hand.
"""
import pandas as pd
import pytest

from fpl.optimize.horizon import MAX_FREE_TRANSFERS, plan_horizon, prune_pool

POSITIONS = ["GKP"] * 3 + ["DEF"] * 7 + ["MID"] * 7 + ["FWD"] * 5


def _pool(n=22, cost=50):
    """A legal pool: enough of each position to field two different squads."""
    return pd.DataFrame({
        "id": range(1, n + 1),
        "web_name": [f"P{i}" for i in range(1, n + 1)],
        "team_short": [f"T{i % 8}" for i in range(1, n + 1)],
        "team": [i % 8 for i in range(1, n + 1)],
        "position": POSITIONS[:n],
        "now_cost": [cost] * n,
        "predicted_points": [1.0] * n,
    })


def _squad_of(df):
    """A legal 15 from the pool: 2 GKP, 5 DEF, 5 MID, 3 FWD."""
    take = {"GKP": 2, "DEF": 5, "MID": 5, "FWD": 3}
    ids = []
    for position, count in take.items():
        ids += list(df[df["position"] == position]["id"].head(count))
    return ids


def _flat_points(df, events, value=1.0):
    return {t: {int(pid): value for pid in df["id"]} for t in events}


def test_a_squad_with_nothing_to_gain_makes_no_transfers():
    """
    Every player identical, so any transfer is pure churn. A solver that moves
    anyway is one that will invent activity on a real squad too.
    """
    df = _pool()
    squad = _squad_of(df)
    events = [1, 2, 3]
    plan = plan_horizon(df, _flat_points(df, events), squad, bank=0, free_transfers=1, events=events)
    assert plan["total_points_hit"] == 0
    assert all(w["transfers_made"] == 0 for w in plan["weeks"])


def test_the_free_transfer_rolls_and_is_capped():
    df = _pool()
    squad = _squad_of(df)
    events = list(range(1, 8))
    plan = plan_horizon(df, _flat_points(df, events), squad, bank=0, free_transfers=1, events=events)
    banked = [w["free_transfers"] for w in plan["weeks"]]
    # Nothing is worth buying, so the allowance just accumulates - one a week,
    # and never past the cap.
    assert banked[0] == 1
    assert banked == sorted(banked)
    assert max(banked) <= MAX_FREE_TRANSFERS


def test_a_hit_is_taken_when_the_weeks_that_follow_pay_for_it():
    """
    The thing a per-week solve cannot see: the cost lands once and the benefit
    lands every week after. One player is worth far more than the rest, so
    buying him early is worth four points even though this week alone is not.
    """
    df = _pool()
    squad = _squad_of(df)
    events = [1, 2, 3, 4, 5]
    target = int(df[~df["id"].isin(squad)].iloc[0]["id"])
    points = _flat_points(df, events)
    for t in events:
        points[t][target] = 12.0

    plan = plan_horizon(df, points, squad, bank=0, free_transfers=0, events=events)
    bought = [p["id"] for w in plan["weeks"] for p in w["transfers_in"]]
    assert target in bought
    assert plan["total_points_hit"] >= 4
    # And it happens in the first week, not the last - the point of paying is
    # to have him for the weeks that follow.
    assert target in [p["id"] for p in plan["weeks"][0]["transfers_in"]]


def test_a_player_is_never_bought_and_sold_in_the_same_week():
    df = _pool()
    squad = _squad_of(df)
    events = [1, 2, 3]
    plan = plan_horizon(df, _flat_points(df, events), squad, bank=0, free_transfers=2, events=events)
    for week in plan["weeks"]:
        ins = {p["id"] for p in week["transfers_in"]}
        outs = {p["id"] for p in week["transfers_out"]}
        assert not (ins & outs)


def test_transfers_balance_so_the_squad_stays_fifteen():
    df = _pool()
    squad = _squad_of(df)
    events = [1, 2]
    target = int(df[~df["id"].isin(squad)].iloc[0]["id"])
    points = _flat_points(df, events)
    points[1][target] = 30.0
    points[2][target] = 30.0
    plan = plan_horizon(df, points, squad, bank=0, free_transfers=1, events=events)
    for week in plan["weeks"]:
        assert len(week["transfers_in"]) == len(week["transfers_out"])


def test_an_unavailable_player_is_never_bought_however_good_he_looks():
    df = _pool()
    squad = _squad_of(df)
    events = [1, 2]
    target = int(df[~df["id"].isin(squad)].iloc[0]["id"])
    df["unavailable"] = df["id"] == target
    points = _flat_points(df, events)
    points[1][target] = 99.0
    points[2][target] = 99.0
    plan = plan_horizon(df, points, squad, bank=0, free_transfers=2, events=events)
    assert target not in [p["id"] for w in plan["weeks"] for p in w["transfers_in"]]


def test_a_squad_id_outside_the_pool_is_a_clear_error_not_a_wrong_answer():
    df = _pool()
    with pytest.raises(ValueError, match="not in the pool"):
        plan_horizon(df, _flat_points(df, [1]), [9999], bank=0, free_transfers=1, events=[1])


def test_pruning_keeps_everyone_you_own_however_far_they_have_fallen():
    """
    An injured player who has dropped out of the top thirty is exactly the one
    the solver most needs to be able to sell.
    """
    df = _pool(n=22)
    df.loc[df["id"] == 1, "predicted_points"] = -99.0
    pruned = prune_pool(df, current_squad_ids=[1], per_position=1)
    assert 1 in set(pruned["id"])
