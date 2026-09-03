"""
Who else has this player, and how much it costs you when he hauls.

Plain ownership - "selected by 43.2%" - is the number the game shows and the
wrong one for almost every decision. It counts a player sitting on someone's
bench the same as a player wearing their armband, and those are not the same
threat at all. A captained Haaland pays his owner double; a benched one pays
nothing.

Effective ownership fixes that by counting how many times a player's score
actually lands: the sum of everyone's multiplier, over the number of managers.
Bench contributes 0, a starter 1, a captain 2, a triple captain 3. So a player
started by 60% of a league and captained by 30% has an effective ownership of
90%, and out-scoring him by four points still loses ground to most of them.

This is computed over a *league*, not the whole game, and that is the point
rather than a limitation. FPL publishes no captaincy figures, so a global
effective ownership has to be sampled or modelled, and either way it is an
estimate dressed as a fact. A mini-league's picks are all readable, so the
number here is exact and it answers the question a manager actually has, which
is not "how do I do against eleven million people" but "how do I catch the two
people above me". That comparison is also one the official game cannot make
for you: it answers for everyone at once.
"""
from collections import defaultdict

# What each FPL multiplier means, for readers who have not memorised them.
BENCH = 0
STARTING = 1
CAPTAIN = 2
TRIPLE_CAPTAIN = 3


def effective_ownership(picks_by_entry, rivals=()):
    """
    element id -> ownership figures across the managers in `picks_by_entry`.

    `picks_by_entry` is {entry_id: [{"element": int, "multiplier": int}, ...]},
    exactly the shape FPL's picks endpoint returns. `rivals` is the subset of
    entry ids whose holdings are reported separately - the managers a user is
    actually chasing, for whom "how many of them own this" is a sharper
    question than the league-wide figure.

    Every figure is a percentage of the managers counted, rounded to one
    decimal, because a second decimal place on a twelve-person league is
    noise pretending to be precision.
    """
    entries = len(picks_by_entry)
    if not entries:
        return {}

    rivals = {r for r in rivals if r in picks_by_entry}
    owned = defaultdict(int)
    started = defaultdict(int)
    captained = defaultdict(int)
    multiplier_total = defaultdict(int)
    rival_owned = defaultdict(int)

    for entry_id, picks in picks_by_entry.items():
        for pick in picks:
            element = pick["element"]
            multiplier = int(pick.get("multiplier", 0))
            owned[element] += 1
            multiplier_total[element] += multiplier
            if multiplier >= STARTING:
                started[element] += 1
            if multiplier >= CAPTAIN:
                captained[element] += 1
            if entry_id in rivals:
                rival_owned[element] += 1

    def pct(count):
        return round(count / entries * 100, 1)

    return {
        element: {
            "entries": entries,
            "owned": pct(owned[element]),
            "owned_count": owned[element],
            "started": pct(started[element]),
            "captained": pct(captained[element]),
            # The headline. Can exceed 100%: a player everyone starts and half
            # the league captains is at 150%, which is exactly the situation
            # the number exists to warn you about.
            "effective": pct(multiplier_total[element]),
            "rivals_owning": rival_owned[element],
            "rival_count": len(rivals),
        }
        for element in owned
    }


def differential_verdict(figures, you_own=False):
    """
    One phrase for how sharp a punt is, or how exposed you are without it.

    Bands rather than a raw percentage because the decision is categorical -
    you either need this player to keep pace or you do not - and nobody reads
    a list of twenty percentages and ranks them.

    Two things this deliberately gets right. "Nobody has him" is decided by
    ownership, not by effective ownership: a player the whole league owns and
    nobody starts has an effective ownership of zero and is emphatically not a
    differential, he is a bench-warmer everyone is holding. And a player you
    already own does not need warning about - the same 90% that reads as a
    threat when you are missing him reads as protection when you are not.
    """
    if figures is None:
        return "nobody in your league has him"

    others = figures["owned_count"] - (1 if you_own else 0)
    if others <= 0:
        return "you are the only one with him" if you_own else "nobody in your league has him"

    effective = figures["effective"]
    if you_own:
        if effective >= 100:
            return "so does most of your league, and they are captaining him"
        if effective >= 60:
            return "so does most of your league"
        if effective >= 30:
            return "a real chunk of your league has him too"
        return "barely anyone else is starting him"

    if effective >= 100:
        return "you cannot afford to miss this one"
    if effective >= 60:
        return "most of your league has him"
    if effective >= 30:
        return "a real chunk of your league has him"
    return "only a couple of them have him"


def league_differentials(picks_by_entry, squad_elements, rivals=()):
    """
    The two lists that actually change a decision: what you hold that your
    league mostly does not, and what your league holds that you do not.

    Sorted by effective ownership, because that is the order in which they
    matter - the player half your league captains costs you more ground than
    the one two people have on their bench.
    """
    figures = effective_ownership(picks_by_entry, rivals=rivals)
    held = set(squad_elements)

    yours = sorted(
        ({"element": e, **f} for e, f in figures.items() if e in held),
        key=lambda row: row["effective"],
    )
    theirs = sorted(
        ({"element": e, **f} for e, f in figures.items() if e not in held),
        key=lambda row: row["effective"], reverse=True,
    )
    return {"your_differentials": yours, "your_exposure": theirs}
