"""
The model's own season, played by the same rules as everybody else.

The accuracy page proves the projections rank players better than a naive
baseline. That is the right question for a statistician and the wrong one for a
manager, who does not buy a rank correlation - they buy a squad, under a budget,
with one transfer a week, and they are judged on a single number at the end of
the season.

So this plays the season out. Gameweek 1: build the best fifteen the model can
see for GBP100.0m. Every gameweek after: the free transfers the game would
actually have given, the transfers the solver would actually have made, the
eleven it would have started, the armband it would have worn - then score it
against what really happened and look up where that total sits in the game's
overall table. No hindsight anywhere: each week's decisions are made from a
projection built with data from strictly before that deadline.

WHAT IS SIMULATED, AND HOW FAITHFULLY
-------------------------------------
The rules that change the answer are all here, because a replay that quietly
skips one is worth nothing:

  * Budget and squad shape - GBP100.0m, 2/5/5/3, at most three per club.
  * Free transfers - one from gameweek 2, one more each week, banked to a
    maximum of five, and every transfer beyond the balance costs four points.
    See fpl.domain.transfers, where that rule was established from real
    managers' hits rather than from memory.
  * Selling price - FPL gives back the purchase price plus half the rise,
    rounded down to the nearest GBP0.1m. A replay that sells at market price
    hands itself money the real game would not have, and the error compounds
    all season.
  * Auto-substitution - a starter who does not play is replaced by the first
    bench player who does and who leaves the formation legal. Skipping this
    understates the score of every week with an injury or a rotation in it,
    which is most of them.
  * Vice-captain - if the captain does not appear, the armband passes. Same
    reason.

WHAT IS NOT
-----------
Chips. The squad carries all of them and plays none, and each gameweek says so.
Deciding when to play a chip is a forward-looking judgement call, and making it
inside a replay needs the chip scan wired to each historical deadline - real
work, and not work that GW1-2 forces, since nobody's chip decision is settled
this early. Until that lands, the run is a no-chip season and the total is
understated by whatever the chips would have been worth. It is labelled that way
rather than quietly rolled into the headline.

Because chips are held, this is a floor on what following the model would have
returned, not a best case. That is the honest direction for the error to run in.
"""
import logging

from fpl.domain.transfers import (
    FIRST_ACCRUING_EVENT,
    INITIAL_FREE_TRANSFERS,
    MAX_FREE_TRANSFERS,
)

log = logging.getLogger(__name__)

# The budget every manager starts the season with, in FPL's tenths-of-a-million.
STARTING_BUDGET = 1000

# What a transfer beyond the free allowance costs.
POINTS_PER_HIT = 4

# Squad shape, and what a legal eleven looks like once auto-subs have run.
SQUAD_SHAPE = {"GKP": 2, "DEF": 5, "MID": 5, "FWD": 3}
XI_LIMITS = {"GKP": (1, 1), "DEF": (3, 5), "MID": (2, 5), "FWD": (1, 3)}
XI_SIZE = 11


def selling_price(bought_for, current_price):
    """
    What FPL pays back for a player, in tenths.

    A rise is only half returned, rounded down to the nearest GBP0.1m; a fall is
    taken in full. Selling at market price instead would quietly fund transfers
    the real game could not afford, and the gap grows every week a squad holds a
    riser.

    >>> selling_price(50, 57)   # bought 5.0, now 5.7 -> 5.0 + 0.3
    53
    >>> selling_price(50, 45)   # a fall is not softened
    45
    """
    if current_price <= bought_for:
        return current_price
    return bought_for + (current_price - bought_for) // 2


def free_transfers_after(previous_balance, transfers_made, event):
    """
    The balance carried into the next gameweek.

    Spending more than the balance is a hit, not a debt: the bank floors at zero
    before the week's accrual, so a manager who took a -8 still starts next week
    with one. Same rule as fpl.domain.transfers replays from history; this is the
    forward-looking half of it.
    """
    if event < FIRST_ACCRUING_EVENT:
        return INITIAL_FREE_TRANSFERS
    return min(max(previous_balance - transfers_made, 0) + 1, MAX_FREE_TRANSFERS)


def points_hit(transfers_made, free_transfers):
    """What the week's transfers cost beyond the free allowance."""
    return POINTS_PER_HIT * max(0, transfers_made - free_transfers)


def order_bench(bench, projected):
    """
    Bench order: outfielders by projection, best first, keeper last.

    FPL substitutes in bench order, and the keeper occupies its own slot -
    he can only ever replace the other keeper. Ordering the outfielders by what
    the model expected is what the app would have advised, and it is the only
    ordering available that uses no hindsight.
    """
    keepers = [p for p in bench if p["position"] == "GKP"]
    outfield = [p for p in bench if p["position"] != "GKP"]
    outfield.sort(key=lambda p: (-projected.get(p["id"], 0.0), p["id"]))
    return outfield + keepers


def _formation_is_legal(players):
    counts = {}
    for p in players:
        counts[p["position"]] = counts.get(p["position"], 0) + 1
    if len(players) != XI_SIZE:
        return False
    return all(lo <= counts.get(pos, 0) <= hi for pos, (lo, hi) in XI_LIMITS.items())


def auto_substitute(starters, bench, minutes):
    """
    FPL's own substitution pass: replace non-appearing starters with bench
    players who did appear, in bench order, keeping the formation legal.

    `minutes` maps element id to minutes played. Returns (final_xi, subs), where
    each sub is {"off": id, "on": id}.

    Every starter who blanked at zero minutes is considered, and each is offered
    the bench in order; a swap is taken only if the resulting eleven is still a
    legal formation, which is what stops the third defender being replaced by a
    fourth forward. A keeper can only be replaced by the other keeper, and that
    falls out of the legality check rather than needing its own branch.

    Without this the replay scores an unplayed starter as zero and leaves a
    returning substitute on the bench - understating almost every gameweek, and
    understating it worst in the weeks a real manager was glad of the bench.
    """
    final = list(starters)
    available = [p for p in bench if minutes.get(p["id"], 0) > 0]
    subs = []

    for i, player in enumerate(final):
        if minutes.get(player["id"], 0) > 0:
            continue
        for candidate in available:
            trial = list(final)
            trial[i] = candidate
            if _formation_is_legal(trial):
                final[i] = candidate
                available.remove(candidate)
                subs.append({"off": player["id"], "on": candidate["id"]})
                break

    return final, subs


def captain_multiplier_target(captain_id, vice_id, minutes):
    """
    Who actually wears the armband once the results are in.

    The captain keeps it if he appeared; otherwise it passes to the vice. If
    neither played, it stays with the captain and is worth nothing, which is
    what the game does.
    """
    if minutes.get(captain_id, 0) > 0:
        return captain_id
    if vice_id is not None and minutes.get(vice_id, 0) > 0:
        return vice_id
    return captain_id


def score_gameweek(starters, bench, captain_id, vice_id, points, minutes):
    """
    A gameweek's score: the eleven that finished on the pitch, captain doubled.

    `points` and `minutes` map element id to what that player actually did.
    Returns a dict carrying the score and enough detail to show the week's
    working - which substitutions fired, and who ended up with the armband.
    """
    final_xi, subs = auto_substitute(starters, bench, minutes)
    armband = captain_multiplier_target(captain_id, vice_id, minutes)

    total = 0
    for player in final_xi:
        scored = points.get(player["id"], 0)
        total += scored * 2 if player["id"] == armband else scored

    return {
        "points": total,
        "captain_id": armband,
        "captain_changed": armband != captain_id,
        "substitutions": subs,
        "final_xi": [p["id"] for p in final_xi],
        "bench_points": sum(points.get(p["id"], 0) for p in bench
                            if p["id"] not in {x["id"] for x in final_xi}),
    }


def squad_value(squad, prices):
    """The squad's market value in tenths, at this gameweek's prices."""
    return sum(prices.get(p["id"], p.get("bought_for", 0)) for p in squad)


def bank_after_transfers(bank, sold, bought, prices, bought_for):
    """
    Money left after a set of transfers, in tenths.

    Sales return the FPL selling price - purchase price plus half the rise -
    rather than the market price, which is the difference between a replay that
    can afford its own suggestions and one that cannot.
    """
    proceeds = sum(
        selling_price(bought_for.get(pid, prices.get(pid, 0)), prices.get(pid, 0))
        for pid in sold
    )
    outlay = sum(prices.get(pid, 0) for pid in bought)
    return bank + proceeds - outlay
