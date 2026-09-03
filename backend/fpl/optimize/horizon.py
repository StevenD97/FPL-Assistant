"""
Transfers planned over a horizon, not one gameweek at a time.

The single-gameweek optimiser answers "what is the best move this week", which
is the wrong question in a game where the free transfer rolls, hits are paid
once, and a player is bought for the fixtures ahead of him rather than the one
in front of him. Ask it five weeks running and you get five locally optimal
moves that between them make no plan: it will sell a player in GW12 that it
bought in GW11, because each week it has forgotten the last one.

This solves all of it at once. One integer program over the whole window, with
the squad's state carried gameweek to gameweek, free transfers accumulating the
way the real game accumulates them, and each hit charged once against the
points every week that follows it. That is what makes "take a -4 now to have
him for the double gameweek" expressible - the cost lands in one week and the
benefit in several, which no per-week solve can see.

Two things it deliberately does not model, both stated rather than hidden:

  * Selling price. FPL pays you the mid-point of what you paid and what he is
    worth now; this uses current price on both sides, exactly as the
    single-week optimiser does. Getting it right needs each player's purchase
    price, which the API does not expose for other managers.
  * Chips. A wildcard or free hit changes the transfer rules for one week, and
    folding them in would make the plan a chip strategy rather than a transfer
    plan. Chip timing has its own scan.

The pool is pruned before solving, and that is the difference between a few
seconds and a few minutes - see CANDIDATES_PER_POSITION.
"""
import pandas as pd
import pulp

from fpl.optimize.squad import (
    MAX_PER_CLUB,
    POINTS_PER_TRANSFER_HIT,
    SQUAD_POSITION_LIMITS,
    STARTING_XI_LIMITS,
    _solve,
)

# How many candidates per position the solver may consider, on top of everyone
# already in the squad.
#
# The full pool is ~600 players; over five gameweeks that is tens of thousands
# of binaries and CBC will sit there. The players who could plausibly enter a
# fifteen-man squad are the best few dozen in each position, and pruning to
# them turns a solve that times out into one that takes a couple of seconds.
#
# It is a real approximation and worth being honest about: a cheap enabler who
# only makes sense as the fourth-best defender because he frees money elsewhere
# can fall outside the cut. Ranked by predicted points over the horizon, which
# is the same ordering the objective uses, so anything excluded was worse at
# the thing being maximised.
CANDIDATES_PER_POSITION = 30

# The most free transfers FPL lets you bank.
MAX_FREE_TRANSFERS = 5

# A hair's weight against making a transfer at all.
#
# Without it, two plans that score identically are equally optimal and the
# solver returns whichever it reached first - which on a squad where nothing is
# worth changing means arbitrary churn, a swap that gains nothing and reads as
# advice. Small enough that it can never outweigh a real difference (the
# smallest gain worth acting on is a tenth of a point, a hundred times this),
# large enough to break an exact tie toward standing still.
#
# "Do nothing" being the default when nothing is better is not a cosmetic
# preference: a transfer spends a free transfer that would otherwise roll.
TRANSFER_TIEBREAK = 0.001


def prune_pool(players_df, current_squad_ids, per_position=CANDIDATES_PER_POSITION):
    """
    The current squad, plus the strongest candidates in each position.

    Everyone owned is kept regardless of rank - the solver has to be able to
    sell them, and an injured player who has dropped out of the top thirty is
    exactly the one you most want it looking at.
    """
    owned = players_df[players_df["id"].isin(current_squad_ids)]
    candidates = (
        players_df[~players_df["id"].isin(current_squad_ids)]
        .sort_values("predicted_points", ascending=False)
        .groupby("position", group_keys=False)
        .head(per_position)
    )
    return pd.concat([owned, candidates]).drop_duplicates(subset="id").reset_index(drop=True)


def plan_horizon(players_df, points_by_event, current_squad_ids, bank, free_transfers,
                 events, max_hits_per_event=2):
    """
    A transfer plan across `events`.

    `points_by_event` maps event -> {player id: predicted points that week}.
    `players_df` needs id, position, team, now_cost and (for pruning) a
    predicted_points total over the window.

    Returns the per-gameweek plan: who comes in, who goes out, how many
    transfers were free, what was paid, and the projected points.

    `max_hits_per_event` bounds how self-destructive the plan may get. Without
    it the solver will occasionally buy a whole new midfield in one week
    because the horizon total just about covers it, which is technically
    optimal against this objective and terrible advice.
    """
    df = players_df.reset_index(drop=True)
    index = list(df.index)
    id_to_idx = {row.id: i for i, row in df.iterrows()}
    missing = [pid for pid in current_squad_ids if pid not in id_to_idx]
    if missing:
        raise ValueError(f"Player id(s) not in the pool (wrong season's bootstrap?): {missing}")
    owned_idx = [id_to_idx[pid] for pid in current_squad_ids]

    prob = pulp.LpProblem("horizon", pulp.LpMaximize)

    # State per gameweek: in the squad, in the XI, wearing the armband.
    squad = {(i, t): pulp.LpVariable(f"sq_{i}_{t}", cat="Binary") for i in index for t in events}
    xi = {(i, t): pulp.LpVariable(f"xi_{i}_{t}", cat="Binary") for i in index for t in events}
    captain = {(i, t): pulp.LpVariable(f"cap_{i}_{t}", cat="Binary") for i in index for t in events}
    buy = {(i, t): pulp.LpVariable(f"buy_{i}_{t}", cat="Binary") for i in index for t in events}
    sell = {(i, t): pulp.LpVariable(f"sell_{i}_{t}", cat="Binary") for i in index for t in events}

    # Free transfers carried into each gameweek, and transfers paid for.
    free = {t: pulp.LpVariable(f"ft_{t}", lowBound=0, upBound=MAX_FREE_TRANSFERS, cat="Integer")
            for t in events}
    hits = {t: pulp.LpVariable(f"hit_{t}", lowBound=0, upBound=max_hits_per_event, cat="Integer")
            for t in events}

    budget = df.loc[owned_idx, "now_cost"].sum() + bank

    for t in events:
        points = points_by_event.get(t, {})

        prob += pulp.lpSum(squad[i, t] for i in index) == 15, f"squad_size_{t}"
        prob += pulp.lpSum(
            squad[i, t] * df.loc[i, "now_cost"] for i in index
        ) <= budget, f"budget_{t}"

        for position, limit in SQUAD_POSITION_LIMITS.items():
            prob += pulp.lpSum(
                squad[i, t] for i in index if df.loc[i, "position"] == position
            ) == limit, f"squad_{position}_{t}"

        for team_id, group in df.groupby("team"):
            prob += pulp.lpSum(
                squad[i, t] for i in group.index
            ) <= MAX_PER_CLUB, f"club_{team_id}_{t}"

        prob += pulp.lpSum(xi[i, t] for i in index) == 11, f"xi_size_{t}"
        for i in index:
            prob += xi[i, t] <= squad[i, t], f"xi_in_squad_{i}_{t}"
            prob += captain[i, t] <= xi[i, t], f"cap_in_xi_{i}_{t}"
        for position, (lo, hi) in STARTING_XI_LIMITS.items():
            count = pulp.lpSum(xi[i, t] for i in index if df.loc[i, "position"] == position)
            prob += count >= lo, f"xi_{position}_min_{t}"
            prob += count <= hi, f"xi_{position}_max_{t}"
        prob += pulp.lpSum(captain[i, t] for i in index) == 1, f"one_captain_{t}"

        # The squad only changes through transfers, and this is the constraint
        # that makes the whole thing a plan rather than five separate answers.
        previous = events[events.index(t) - 1] if events.index(t) > 0 else None
        for i in index:
            before = squad[i, previous] if previous is not None else (1 if i in owned_idx else 0)
            prob += squad[i, t] == before + buy[i, t] - sell[i, t], f"flow_{i}_{t}"
            # A player cannot be bought and sold in the same week.
            prob += buy[i, t] + sell[i, t] <= 1, f"no_churn_{i}_{t}"

        made = pulp.lpSum(buy[i, t] for i in index)
        prob += made == pulp.lpSum(sell[i, t] for i in index), f"balanced_{t}"
        prob += made <= free[t] + hits[t], f"paid_for_{t}"

        if previous is None:
            prob += free[t] == free_transfers, f"ft_start_{t}"
        else:
            # One free transfer accrues each week, capped. An upper bound rather
            # than an equality, because an equality on a min() is not linear and
            # this side is all the solve needs: free[t] appears only on the
            # right of "transfers made <= free + hits", so it can never permit
            # more moves than the rules allow.
            #
            # It does mean the variable's *value* is arbitrary in any week where
            # no transfer was made - nothing pushes it up when nothing needs it -
            # so the figure reported to a reader is recomputed from the plan
            # instead. See _banked_free_transfers.
            prob += free[t] <= free[previous] - pulp.lpSum(buy[i, previous] for i in index) + 1, \
                f"ft_roll_{t}"

        if "unavailable" in df.columns:
            for i in df.index[df["unavailable"].fillna(False)]:
                prob += buy[i, t] == 0, f"no_unavailable_{i}_{t}"

    # Points every week, captain doubled, minus each hit charged once, minus a
    # hair per transfer so ties resolve toward doing nothing.
    prob += (
        pulp.lpSum(
            points_by_event.get(t, {}).get(df.loc[i, "id"], 0.0) * (xi[i, t] + captain[i, t])
            for i in index for t in events
        )
        - POINTS_PER_TRANSFER_HIT * pulp.lpSum(hits[t] for t in events)
        - TRANSFER_TIEBREAK * pulp.lpSum(buy[i, t] for i in index for t in events)
    )

    _solve(prob)
    return _extract_plan(df, events, squad, xi, captain, buy, sell, hits,
                         points_by_event, free_transfers)


def _banked_free_transfers(events, transfers_made, starting):
    """
    How many free transfers are actually in hand each week, by the game's rule:
    one accrues per gameweek, unused ones roll, and the bank is capped.

    Recomputed from the plan rather than read off the solver, whose own
    variable is only an upper bound and sits at whatever value satisfied the
    constraint - which is zero in any week that made no transfers. Reporting
    that to a manager would tell them they have none when they have four.
    """
    banked, have = [], starting
    for t in events:
        banked.append(have)
        have = min(have - transfers_made[t] + 1, MAX_FREE_TRANSFERS)
    return banked


def _extract_plan(df, events, squad, xi, captain, buy, sell, hits, points_by_event,
                  starting_free_transfers):
    def named(i):
        row = df.loc[i]
        return {"id": int(row["id"]), "web_name": row["web_name"],
                "team_short": row.get("team_short", ""), "position": row["position"],
                "cost": round(float(row["now_cost"]) / 10, 1)}

    made_by_event = {
        t: sum(1 for i in df.index if buy[i, t].value() and buy[i, t].value() > 0.5)
        for t in events
    }
    banked = _banked_free_transfers(events, made_by_event, starting_free_transfers)

    weeks, total_hits = [], 0
    for position, t in enumerate(events):
        ins = [named(i) for i in df.index if buy[i, t].value() and buy[i, t].value() > 0.5]
        outs = [named(i) for i in df.index if sell[i, t].value() and sell[i, t].value() > 0.5]
        paid = int(round(hits[t].value() or 0))
        total_hits += paid
        points = points_by_event.get(t, {})
        xi_points = sum(
            points.get(int(df.loc[i, "id"]), 0.0)
            for i in df.index if xi[i, t].value() and xi[i, t].value() > 0.5
        )
        cap_bonus = sum(
            points.get(int(df.loc[i, "id"]), 0.0)
            for i in df.index if captain[i, t].value() and captain[i, t].value() > 0.5
        )
        cap = next((named(i) for i in df.index
                    if captain[i, t].value() and captain[i, t].value() > 0.5), None)
        weeks.append({
            "event": t,
            "transfers_in": ins,
            "transfers_out": outs,
            "transfers_made": len(ins),
            "free_transfers": banked[position],
            "points_hit": paid * POINTS_PER_TRANSFER_HIT,
            "captain": cap["web_name"] if cap else None,
            "predicted_points": round(float(xi_points + cap_bonus), 2),
        })

    return {
        "events": list(events),
        "weeks": weeks,
        "total_points_hit": total_hits * POINTS_PER_TRANSFER_HIT,
        "total_predicted_points": round(
            sum(w["predicted_points"] for w in weeks) - total_hits * POINTS_PER_TRANSFER_HIT, 2),
    }
