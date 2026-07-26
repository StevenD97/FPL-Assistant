"""
Integer-linear-programming squad/transfer optimizer, built on top of
team_model.py's predict_multi_gw_points(). Where team_model.py and
recommendation_score rank players, this solves the actual constrained
decision: given a budget (and, for transfers, an existing squad and a
free-transfer count), what's the provably optimal set of 15 players -
not just "who looks good."

Uses PuLP (bundled CBC solver, MIT licensed) - the same approach the
public FPL-optimizer tools researched for the project sense-check use
(see README). Deliberately optimizes against predict_multi_gw_points(),
not the single-gameweek predict_player_points(): multi_gw_backtest.py
already found multi-week predictions track reality meaningfully better
(r^2 0.30 -> 0.49 from 1 to 5 gameweeks), and a squad/transfer decision
is meant to hold for more than one week anyway.

FPL squad rules encoded here:
  - 15-player squad: 2 GKP, 5 DEF, 5 MID, 3 FWD
  - Starting XI: 1 GKP, 3-5 DEF, 2-5 MID, 1-3 FWD, summing to 11
  - Max 3 players from any one club
  - Budget in £0.1m units (FPL's own now_cost unit - 1000 = £100.0m)

v1 simplification: treats a player's current now_cost as their sale
price for transfer purposes. Not always exactly true in real FPL (a
player who's risen in price only refunds part of the profit on sale),
but that per-manager purchase-price history isn't available through
this project's current data sources - documented the same way as
team_model.py's other approximations (bonus points, defensive
contribution) rather than silently assumed correct.

Run with: venv\\Scripts\\python.exe optimizer.py
"""

import pandas as pd
import pulp

SQUAD_POSITION_LIMITS = {"GKP": 2, "DEF": 5, "MID": 5, "FWD": 3}
STARTING_XI_LIMITS = {"GKP": (1, 1), "DEF": (3, 5), "MID": (2, 5), "FWD": (1, 3)}
MAX_PER_CLUB = 3
POINTS_PER_TRANSFER_HIT = 4
DEFAULT_BUDGET = 1000  # £100.0m, the standard starting budget


def build_player_pool(predicted_df, bootstrap):
    """
    Merges now_cost + numeric team id + set-piece duty order (penalties,
    direct free-kicks, corners/indirect free-kicks) + a few decision-
    support fields into predict_multi_gw_points()'s output - needed for
    the budget/club-limit constraints and set-piece-duty checks, plus
    context a human wants when comparing two similarly-scored players
    (ownership %, live availability). `bootstrap` must be the roster
    season's file predicted_df's roster_bootstrap_file pointed at, or the
    same file if no roster/training split was used - see
    predict_player_points' docstring on why (team ids get reassigned
    every season).

    Adds `value` (predicted_points per GBP1m of cost) since two players
    can have similar predicted_points at very different prices - value
    is what actually matters for squad-building under a budget
    constraint, not raw predicted_points alone.
    """
    extra = pd.DataFrame(bootstrap["elements"])[[
        "id", "code", "now_cost", "team", "penalties_order", "direct_freekicks_order",
        "corners_and_indirect_freekicks_order", "selected_by_percent", "status", "news",
    ]].copy()
    for col in ["penalties_order", "direct_freekicks_order", "corners_and_indirect_freekicks_order"]:
        extra[col] = extra[col].fillna(0).astype(int)
    extra["selected_by_percent"] = extra["selected_by_percent"].astype(float)
    pool = predicted_df.merge(extra, on="id", how="inner")
    pool["value"] = (pool["predicted_points"] / (pool["now_cost"] / 10)).round(2)
    return pool


def _build_squad_vars(players_df):
    return {i: pulp.LpVariable(f"squad_{i}", cat="Binary") for i in players_df.index}


def _add_squad_constraints(prob, squad_vars, players_df, budget):
    prob += pulp.lpSum(squad_vars.values()) == 15, "squad_size"
    prob += pulp.lpSum(
        squad_vars[i] * players_df.loc[i, "now_cost"] for i in players_df.index
    ) <= budget, "budget"

    for position, limit in SQUAD_POSITION_LIMITS.items():
        prob += pulp.lpSum(
            squad_vars[i] for i in players_df.index if players_df.loc[i, "position"] == position
        ) == limit, f"squad_{position}_count"

    for team_id, group in players_df.groupby("team"):
        prob += pulp.lpSum(squad_vars[i] for i in group.index) <= MAX_PER_CLUB, f"club_limit_{team_id}"


def _add_starting_xi_and_captain(prob, squad_vars, players_df):
    xi_vars = {i: pulp.LpVariable(f"xi_{i}", cat="Binary") for i in players_df.index}
    captain_vars = {i: pulp.LpVariable(f"captain_{i}", cat="Binary") for i in players_df.index}

    prob += pulp.lpSum(xi_vars.values()) == 11, "xi_size"
    for i in players_df.index:
        prob += xi_vars[i] <= squad_vars[i], f"xi_needs_squad_{i}"
        prob += captain_vars[i] <= xi_vars[i], f"captain_needs_xi_{i}"

    for position, (lo, hi) in STARTING_XI_LIMITS.items():
        count = pulp.lpSum(xi_vars[i] for i in players_df.index if players_df.loc[i, "position"] == position)
        prob += count >= lo, f"xi_{position}_min"
        prob += count <= hi, f"xi_{position}_max"

    prob += pulp.lpSum(captain_vars.values()) == 1, "one_captain"
    return xi_vars, captain_vars


def _solve(prob):
    status = prob.solve(pulp.PULP_CBC_CMD(msg=0))
    if pulp.LpStatus[status] != "Optimal":
        raise ValueError(
            f"Optimizer did not find an optimal solution ({pulp.LpStatus[status]}) - "
            "likely an infeasible budget/squad combination (e.g. bank too low to field 15 legal players)."
        )


def _extract_result(players_df, squad_vars, xi_vars, captain_vars):
    squad_idx = [i for i in players_df.index if pulp.value(squad_vars[i]) > 0.5]
    xi_idx = {i for i in players_df.index if pulp.value(xi_vars[i]) > 0.5}
    captain_idx = next(i for i in players_df.index if pulp.value(captain_vars[i]) > 0.5)

    squad = players_df.loc[squad_idx, [
        "id", "web_name", "team_short", "position", "now_cost", "predicted_points",
        "value", "selected_by_percent", "status", "code", "team",
    ]].copy()
    squad["role"] = squad.index.map(lambda i: "Starting XI" if i in xi_idx else "Bench")
    squad["captain"] = squad.index == captain_idx
    squad["cost"] = (squad["now_cost"] / 10).round(1)

    xi_points = players_df.loc[list(xi_idx), "predicted_points"].sum()
    captain_bonus = players_df.loc[captain_idx, "predicted_points"]
    position_order = {"GKP": 0, "DEF": 1, "MID": 2, "FWD": 3}
    squad["_pos_order"] = squad["position"].map(position_order)
    squad = squad.sort_values(["role", "_pos_order"], ascending=[False, True]).drop(columns=["_pos_order", "now_cost"])

    return {
        "squad": squad.to_dict(orient="records"),
        "total_cost": round(players_df.loc[squad_idx, "now_cost"].sum() / 10, 1),
        "starting_xi_predicted_points": round(float(xi_points + captain_bonus), 2),
    }


def optimize_best_squad(players_df, budget=DEFAULT_BUDGET):
    """
    From-scratch squad build: the best possible 15 (and starting XI +
    captain) under budget alone, no existing squad to work around - the
    Wildcard/Free Hit/"build from nothing" case.
    """
    players_df = players_df.reset_index(drop=True)
    prob = pulp.LpProblem("best_squad", pulp.LpMaximize)
    squad_vars = _build_squad_vars(players_df)
    _add_squad_constraints(prob, squad_vars, players_df, budget)
    xi_vars, captain_vars = _add_starting_xi_and_captain(prob, squad_vars, players_df)

    prob += (
        pulp.lpSum(xi_vars[i] * players_df.loc[i, "predicted_points"] for i in players_df.index)
        + pulp.lpSum(captain_vars[i] * players_df.loc[i, "predicted_points"] for i in players_df.index)
    )
    _solve(prob)

    result = _extract_result(players_df, squad_vars, xi_vars, captain_vars)
    result["predicted_points"] = result["starting_xi_predicted_points"]
    return result


def optimize_transfers(players_df, current_squad_ids, bank, free_transfers, max_transfers=None):
    """
    Given an existing 15-man squad (by player id) and money in the bank,
    finds the provably optimal set of transfers: which players to buy
    and sell, and how many transfers to make - maximizing predicted
    starting-XI points (captain doubled) minus the 4-point hit for every
    transfer beyond free_transfers. The solver decides transfer COUNT
    itself; making 0 transfers (banking the free transfer) is a valid,
    sometimes-optimal outcome this can return, not something forced.

    budget = current squad's total now_cost + bank (see the v1
    simplification note in the module docstring re: sale price).
    max_transfers caps how many changes the solver may consider (None =
    unlimited, bounded only by squad size/budget) - useful to keep the
    search fast, or to model "I only want to make 1-2 changes."
    """
    players_df = players_df.reset_index(drop=True)
    id_to_idx = {row.id: i for i, row in players_df.iterrows()}
    current_idx = [id_to_idx[pid] for pid in current_squad_ids if pid in id_to_idx]
    if len(current_idx) != len(current_squad_ids):
        missing = set(current_squad_ids) - set(players_df.loc[current_idx, "id"])
        raise ValueError(f"Player id(s) not found in players_df (wrong season's bootstrap?): {missing}")

    budget = players_df.loc[current_idx, "now_cost"].sum() + bank

    prob = pulp.LpProblem("transfers", pulp.LpMaximize)
    squad_vars = _build_squad_vars(players_df)
    _add_squad_constraints(prob, squad_vars, players_df, budget)
    xi_vars, captain_vars = _add_starting_xi_and_captain(prob, squad_vars, players_df)

    transfers_out = pulp.lpSum(1 - squad_vars[i] for i in current_idx)
    if max_transfers is not None:
        prob += transfers_out <= max_transfers, "max_transfers"

    paid_transfers = pulp.LpVariable("paid_transfers", lowBound=0)
    prob += paid_transfers >= transfers_out - free_transfers, "paid_transfers_floor"

    # The tiny -0.0001*transfers_out term is a tie-breaker, not a real cost: without
    # it, the solver is free to pick ANY optimal vertex when several tied solutions
    # exist (e.g. swapping between two equally-worthless bench players), which can
    # report a "transfer" that changes predicted_points not at all - technically
    # correct but confusing. This is far too small to ever sacrifice a real point
    # of value for fewer transfers; it only breaks genuine ties toward inaction.
    prob += (
        pulp.lpSum(xi_vars[i] * players_df.loc[i, "predicted_points"] for i in players_df.index)
        + pulp.lpSum(captain_vars[i] * players_df.loc[i, "predicted_points"] for i in players_df.index)
        - POINTS_PER_TRANSFER_HIT * paid_transfers
        - 0.0001 * transfers_out
    )
    _solve(prob)

    transfers_made = round(pulp.value(transfers_out))
    points_hit = POINTS_PER_TRANSFER_HIT * max(0, transfers_made - free_transfers)

    result = _extract_result(players_df, squad_vars, xi_vars, captain_vars)
    result["predicted_points"] = round(result["starting_xi_predicted_points"] - points_hit, 2)
    result["transfers_made"] = transfers_made
    result["free_transfers"] = free_transfers
    result["points_hit"] = points_hit

    transferred_out = [i for i in current_idx if pulp.value(squad_vars[i]) < 0.5]
    transferred_in = [i for i in players_df.index if i not in current_idx and pulp.value(squad_vars[i]) > 0.5]
    cols = ["id", "web_name", "team_short", "position", "predicted_points", "value", "selected_by_percent", "code", "team"]
    result["transferred_out"] = players_df.loc[transferred_out, cols].to_dict(orient="records")
    result["transferred_in"] = players_df.loc[transferred_in, cols].to_dict(orient="records")
    result["bank"] = round(bank / 10, 1)

    return result


if __name__ == "__main__":
    import sys
    from datetime import datetime

    from analysis import load_bootstrap
    from team_model import predict_multi_gw_points

    sys.stdout.reconfigure(encoding="utf-8")
    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", 200)

    BOOTSTRAP_FILE = "bootstrap_static_2025_26_final.json"
    FIXTURES_FILE = "fixtures_2025_26_final.json"
    REFERENCE_DATE = datetime(2025, 11, 30)
    NEXT_EVENTS = [10, 11, 12, 13, 14]

    bootstrap = load_bootstrap(BOOTSTRAP_FILE)
    predicted = predict_multi_gw_points(
        REFERENCE_DATE, NEXT_EVENTS, bootstrap_file=BOOTSTRAP_FILE, fixtures_file=FIXTURES_FILE,
    )
    pool = build_player_pool(predicted, bootstrap)

    print("=== Best possible squad, £100.0m budget, GW10-14 predicted points ===")
    best = optimize_best_squad(pool)
    print(pd.DataFrame(best["squad"]).to_string(index=False))
    print(f"\nTotal cost: £{best['total_cost']}m   Predicted XI points: {best['predicted_points']}")
