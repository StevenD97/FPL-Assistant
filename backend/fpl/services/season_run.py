"""
Run the model's season and write it down.

The rules live in fpl.domain.season_run, which is pure and testable. This is the
part that has to touch real data: which projection the model had at each
deadline, what everyone cost that week, what they actually scored, and where the
resulting total sits in the game's overall table.

Built offline and committed, the same way the accuracy record is. Replaying a
season means one full projection per gameweek plus an integer program per
gameweek, which is seconds of work each - fine for a job that runs once when a
gameweek finishes, not fine on a page load.
"""
import json
import logging
from pathlib import Path

import pandas as pd

from fpl.config import CURRENT_SEASON, DATA_DIR, LIVE_BOOTSTRAP_FILE
from fpl.data.loaders import load_bootstrap, load_gw_history
from fpl.domain.accuracy import finished_events, projections_for
from fpl.domain.season_run import (
    POINTS_PER_HIT,
    STARTING_BUDGET,
    bank_after_transfers,
    free_transfers_after,
    order_bench,
    points_hit,
    score_gameweek,
    squad_value,
)
from fpl.domain.transfers import INITIAL_FREE_TRANSFERS
from fpl.optimize.squad import build_player_pool, optimize_best_squad, optimize_transfers
from fpl.services.overall_rank import rank_for_total

log = logging.getLogger(__name__)

SEASON_RUN_FILE = Path(DATA_DIR) / "season_run.json"

# How many candidates the weekly transfer solve considers. The full pool is
# ~600 players and the integer program is the slow part of a gameweek; ranking
# by projection first and keeping the best of each position is the same pruning
# the horizon planner uses, for the same reason.
CANDIDATES_PER_POSITION = 40


def _prices_by_event(history, bootstrap, events):
    """
    {event: {element id: price in tenths}} for each gameweek being replayed.

    Gameweek 1 uses the season's opening price, which is exactly
    now_cost - cost_change_start; there is no ambiguity about what a player cost
    before a ball was kicked. Later gameweeks use the price recorded against
    that gameweek in the history, which is accurate to within one price change
    of the deadline itself - FPL does not publish a per-deadline price series,
    and a tenth either way does not move a squad.

    A player with no row in a gameweek (unfixtured, or newly added) keeps the
    last price known for them, falling back to the opening price.
    """
    opening = {
        int(e["id"]): int(e["now_cost"]) - int(e.get("cost_change_start") or 0)
        for e in bootstrap["elements"]
    }
    by_event = {}
    running = dict(opening)
    for event in sorted(events):
        rows = history[history["round"] == event]
        if event > 1:
            for row in rows.itertuples():
                running[int(row.element)] = int(row.value)
        by_event[event] = dict(running)
    return by_event


def _results_by_event(history, events):
    """{event: ({id: points}, {id: minutes})} straight from the season's results."""
    out = {}
    for event in sorted(events):
        rows = history[history["round"] == event]
        points, minutes = {}, {}
        for row in rows.itertuples():
            # A player with two fixtures in one gameweek scores in both.
            pid = int(row.element)
            points[pid] = points.get(pid, 0) + int(row.total_points)
            minutes[pid] = minutes.get(pid, 0) + int(row.minutes)
        out[event] = (points, minutes)
    return out


def _pool_for(event, bootstrap, prices):
    """
    The player pool as it stood at one deadline: the model's projection for that
    gameweek, priced at that gameweek's prices.

    `now_cost` is overwritten deliberately. Everything downstream - the budget
    constraint, the value column, the selling price - reads that field, and
    leaving today's prices in it would let the replay buy a player at a price
    that did not exist yet.
    """
    predicted, source, frozen_at = projections_for(event, bootstrap)
    pool = build_player_pool(predicted, bootstrap)
    pool = pool.copy()
    pool["now_cost"] = pool["id"].map(prices).fillna(pool["now_cost"]).astype(int)
    pool["value"] = (pool["predicted_points"] / (pool["now_cost"] / 10)).round(2)
    return pool, source, frozen_at


def _prune(pool, keep_ids):
    """
    Trim the pool to a solvable size, never dropping a player already owned.

    Keeping the current squad in is not an optimisation detail - a squad member
    missing from the pool cannot be held, so the solver would be forced to sell
    him, and the replay would invent transfers nobody would have made.
    """
    ranked = pool.sort_values(["predicted_points", "id"], ascending=[False, True])
    best = ranked.groupby("position").head(CANDIDATES_PER_POSITION)
    owned = pool[pool["id"].isin(keep_ids)]
    return pd.concat([best, owned]).drop_duplicates(subset="id").reset_index(drop=True)


def _as_players(ids, pool_by_id):
    """Element ids in the shape fpl.domain.season_run works in."""
    return [
        {
            "id": int(pid),
            "web_name": pool_by_id[pid]["web_name"],
            "team_short": pool_by_id[pid].get("team_short", ""),
            "position": pool_by_id[pid]["position"],
        }
        for pid in ids
    ]


def replay(events=None, bootstrap=None, with_rank=True):
    """
    Play the model's season and return every gameweek plus the running total.

    Each gameweek is decided from that week's projection alone and then scored
    against that week's results - no gameweek can see its own outcome, and none
    can see a later one.
    """
    bootstrap = bootstrap or load_bootstrap(LIVE_BOOTSTRAP_FILE)
    if events is None:
        events = finished_events(bootstrap)
    events = sorted(events)
    if not events:
        return {"gameweeks": [], "summary": None}

    history = load_gw_history(CURRENT_SEASON)
    prices_by_event = _prices_by_event(history, bootstrap, events)
    results = _results_by_event(history, events)

    squad_ids, bought_for = [], {}
    bank = STARTING_BUDGET
    free_transfers = INITIAL_FREE_TRANSFERS
    total_points = total_hits = 0
    gameweeks = []

    for event in events:
        prices = prices_by_event[event]
        pool, source, frozen_at = _pool_for(event, bootstrap, prices)
        pool_by_id = {int(r["id"]): r for r in pool.to_dict(orient="records")}

        if not squad_ids:
            # Gameweek 1: the whole budget, no squad to work around.
            result = optimize_best_squad(_prune(pool, []), budget=STARTING_BUDGET)
            transfers_in, transfers_out, made = [], [], 0
            spent = sum(prices.get(int(p["id"]), 0) for p in result["squad"])
            bank = STARTING_BUDGET - spent
            bought_for = {int(p["id"]): prices.get(int(p["id"]), 0) for p in result["squad"]}
        else:
            result = optimize_transfers(
                _prune(pool, squad_ids), squad_ids, bank=bank,
                free_transfers=free_transfers, allow_hits=False,
            )
            transfers_in = [int(p["id"]) for p in result.get("transferred_in", [])]
            transfers_out = [int(p["id"]) for p in result.get("transferred_out", [])]
            made = len(transfers_in)
            bank = bank_after_transfers(bank, transfers_out, transfers_in, prices, bought_for)
            for pid in transfers_out:
                bought_for.pop(pid, None)
            for pid in transfers_in:
                bought_for[pid] = prices.get(pid, 0)

        squad_ids = [int(p["id"]) for p in result["squad"]]
        starters = _as_players(
            [int(p["id"]) for p in result["squad"] if p.get("role") == "Starting XI"], pool_by_id)
        bench_rows = [int(p["id"]) for p in result["squad"] if p.get("role") != "Starting XI"]
        projected = {int(r["id"]): float(r["predicted_points"]) for r in pool_by_id.values()}
        bench = order_bench(_as_players(bench_rows, pool_by_id), projected)

        captain_id = next((int(p["id"]) for p in result["squad"] if p.get("captain")), None)
        vice_id = next(
            (p["id"] for p in sorted(starters, key=lambda x: -projected.get(x["id"], 0.0))
             if p["id"] != captain_id), None)

        points, minutes = results.get(event, ({}, {}))
        scored = score_gameweek(starters, bench, captain_id, vice_id, points, minutes)

        hit = points_hit(made, free_transfers)
        net = scored["points"] - hit
        total_points += net
        total_hits += hit

        gameweeks.append({
            "event": event,
            "source": source,
            "frozen_at": frozen_at,
            "points": scored["points"],
            "points_hit": hit,
            "net_points": net,
            "total_points": total_points,
            "free_transfers": free_transfers,
            "transfers_made": made,
            "bank": round(bank / 10, 1),
            "squad_value": round(squad_value(
                [{"id": pid, "bought_for": bought_for.get(pid, 0)} for pid in squad_ids],
                prices) / 10, 1),
            "captain": pool_by_id[scored["captain_id"]]["web_name"] if scored["captain_id"] else None,
            "captain_changed": scored["captain_changed"],
            "bench_points": scored["bench_points"],
            "chips_played": [],
            "squad": [
                {
                    "id": pid,
                    "web_name": pool_by_id[pid]["web_name"],
                    "team_short": pool_by_id[pid].get("team_short", ""),
                    "position": pool_by_id[pid]["position"],
                    "cost": round(prices.get(pid, 0) / 10, 1),
                    "predicted_points": round(projected.get(pid, 0.0), 1),
                    "actual_points": points.get(pid, 0),
                    "minutes": minutes.get(pid, 0),
                    "started": pid in scored["final_xi"],
                    "captain": pid == scored["captain_id"],
                }
                for pid in squad_ids
            ],
            "transfers_in": [pool_by_id[p]["web_name"] for p in transfers_in if p in pool_by_id],
            "transfers_out": [pool_by_id[p]["web_name"] for p in transfers_out if p in pool_by_id],
            "substitutions": [
                {
                    "off": pool_by_id[s["off"]]["web_name"],
                    "on": pool_by_id[s["on"]]["web_name"],
                }
                for s in scored["substitutions"]
                if s["off"] in pool_by_id and s["on"] in pool_by_id
            ],
        })

        free_transfers = free_transfers_after(free_transfers, made, event)

    return {"gameweeks": gameweeks, "summary": summarise(gameweeks, bootstrap, with_rank)}


def summarise(gameweeks, bootstrap=None, with_rank=True):
    """
    The headline: what the season is worth so far, and against what.

    `with_rank` looks the total up in the game's Overall table, which costs a
    few dozen requests. On by default because the rank is the point of the
    exercise; off for tests and for anything that must not touch the network.
    """
    if not gameweeks:
        return None
    bootstrap = bootstrap or load_bootstrap(LIVE_BOOTSTRAP_FILE)
    averages = {
        e["id"]: e.get("average_entry_score") or 0
        for e in bootstrap.get("events", [])
    }
    played = [gw["event"] for gw in gameweeks]
    field = sum(averages.get(e, 0) for e in played)
    total = gameweeks[-1]["total_points"]
    return {
        "events_played": len(gameweeks),
        "first_event": played[0],
        "last_event": played[-1],
        "total_points": total,
        "total_hits": sum(gw["points_hit"] for gw in gameweeks),
        "field_total": field,
        "points_vs_field": total - field,
        # Every gameweek here is a reconstruction until freezing has been
        # running for a full season, so say so once at the top rather than
        # leaving a reader to infer it from the per-week labels.
        "all_reconstructed": all(gw["source"] == "reconstructed" for gw in gameweeks),
        "chips_available": True,
        # The denominator comes from the bootstrap, which states it outright.
        # The search that finds the rank only ever sees the pages it probed, so
        # the deepest rank it happened to touch is not the size of the table and
        # must not be published as one.
        "overall_entries": bootstrap.get("total_players"),
        "overall_rank": _rank_or_none(total, with_rank),
    }


def _rank_or_none(total, with_rank):
    """
    Where the total sits in the game's Overall table, if it could be looked up.

    A failed lookup leaves the rank null rather than substituting an estimate.
    An invented rank is worse than none: the whole reason to binary search ten
    million real entries is that the answer comes back a fact.
    """
    if not with_rank:
        return None
    found = rank_for_total(total)
    return found["rank"] if found else None


def load_run():
    """The committed run, or None when it has never been built."""
    try:
        with open(SEASON_RUN_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def save_run(run):
    SEASON_RUN_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SEASON_RUN_FILE, "w", encoding="utf-8") as f:
        json.dump(run, f, indent=1, sort_keys=True)
        f.write("\n")
    return SEASON_RUN_FILE
