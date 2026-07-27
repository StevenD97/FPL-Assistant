"""
Unit tests for the PuLP squad optimiser (fpl.optimize.squad) on a small
synthetic player pool — checks the hard FPL constraints hold, independent of
any live data or the prediction model.
"""
import pandas as pd
import pytest

from fpl.optimize.squad import (
    MAX_PER_CLUB,
    SQUAD_POSITION_LIMITS,
    STARTING_XI_LIMITS,
    optimize_best_squad,
    optimize_transfers,
)


def _synthetic_pool():
    """A legal, solvable pool: enough of each position across enough clubs that
    a valid 15 (2/5/5/3) with <=3 per club fits comfortably under budget."""
    rows = []
    pid = 1
    # positions -> how many to create; costs kept low so budget is never binding.
    plan = {"GKP": 6, "DEF": 12, "MID": 12, "FWD": 8}
    for position, count in plan.items():
        for n in range(count):
            rows.append({
                "id": pid,
                "web_name": f"{position}{n}",
                "team_short": f"T{pid % 12}",
                "team": pid % 12,          # 12 clubs -> at most a few per club
                "position": position,
                "now_cost": 45 + (pid % 5),  # £4.5m-£4.9m
                "predicted_points": float(pid % 10),
                "value": 1.0,
                "selected_by_percent": 5.0,
                "status": "a",
                "code": 1000 + pid,
            })
            pid += 1
    return pd.DataFrame(rows)


def _assert_legal_squad(result):
    squad = result["squad"]
    assert len(squad) == 15

    by_pos = {}
    by_club = {}
    for row in squad:
        by_pos[row["position"]] = by_pos.get(row["position"], 0) + 1
        by_club[row["team"]] = by_club.get(row["team"], 0) + 1
    assert by_pos == SQUAD_POSITION_LIMITS
    assert max(by_club.values()) <= MAX_PER_CLUB

    xi = [r for r in squad if r["role"] == "Starting XI"]
    assert len(xi) == 11
    xi_by_pos = {}
    for r in xi:
        xi_by_pos[r["position"]] = xi_by_pos.get(r["position"], 0) + 1
    for position, (lo, hi) in STARTING_XI_LIMITS.items():
        assert lo <= xi_by_pos.get(position, 0) <= hi

    assert sum(1 for r in squad if r["captain"]) == 1
    captain = next(r for r in squad if r["captain"])
    assert captain["role"] == "Starting XI"


def test_best_squad_obeys_squad_and_xi_and_club_constraints():
    result = optimize_best_squad(_synthetic_pool(), budget=1000)
    _assert_legal_squad(result)
    assert result["total_cost"] <= 100.0  # £100.0m == budget 1000


def test_best_squad_respects_budget():
    # Tight budget (still feasible with cheap players) — total must not exceed it.
    result = optimize_best_squad(_synthetic_pool(), budget=720)
    assert round(result["total_cost"] * 10) <= 720
    _assert_legal_squad(result)


def test_best_squad_infeasible_budget_raises():
    with pytest.raises(ValueError):
        optimize_best_squad(_synthetic_pool(), budget=1)  # can't field 15 legal players


def test_optimize_transfers_respects_max_transfers_cap():
    pool = _synthetic_pool()
    # Start from a legal 15 taken straight out of the optimal build, then cap changes at 1.
    current = [r["id"] for r in optimize_best_squad(pool, budget=1000)["squad"]]
    result = optimize_transfers(pool, current, bank=50, free_transfers=1, max_transfers=1)
    assert len(result["transferred_in"]) == len(result["transferred_out"])
    assert len(result["transferred_out"]) <= 1
    _assert_legal_squad(result)


def test_optimize_transfers_unknown_player_id_raises():
    pool = _synthetic_pool()
    current = list(range(1, 15)) + [999_999]  # last id not in the pool
    with pytest.raises(ValueError):
        optimize_transfers(pool, current, bank=50, free_transfers=1)
