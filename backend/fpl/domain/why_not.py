"""
The question a ranked list never answers: why not the other one?

Every surface in this app puts a recommendation at the top and the runners-up
below it, and a manager arrives with their own idea. Ranking tells them the
model disagrees; it does not tell them why, and "the model says so" is exactly
the answer this product exists not to give.

There is already a "Why not X?" for players. These are the other three
decisions a manager actually argues with themselves about: the armband, taking
a hit, and when to play a chip. Each one returns a sentence built from the
figures that decided it - see fpl.domain.rationale for the same rule, and
fpl/../shared/ui/DerivedNote.tsx for why none of this may ever be generated.

Every function here answers honestly when the answer is "your idea is better",
because a "why not" that can only ever defend the recommendation is not a
comparison, it is a rationalisation.
"""

# What a transfer beyond the free allowance costs.
POINTS_PER_HIT = 4


def why_not_captain(top, alternative):
    """
    Why the model prefers `top` over `alternative` for the armband.

    Both are captaincy options as squad.py builds them: web_name,
    predicted_points_next, and - when the distribution is available - the
    haul probability and range.

    Projection first, because that is what the ranking is on, then the shape,
    because two players projecting within a point of each other are really
    being separated by how likely each is to have the big week that the armband
    is a bet on.
    """
    if not top or not alternative:
        return None
    if top.get("web_name") == alternative.get("web_name"):
        return None

    gap = round(top.get("predicted_points_next", 0) - alternative.get("predicted_points_next", 0), 1)
    name = alternative["web_name"]

    if gap >= 0.1:
        lead = f"{name} projects {gap:.1f} fewer points than {top['web_name']}"
    elif gap <= -0.1:
        # The runner-up out-projects the top pick, which happens when the list
        # is ranked over a different horizon. Say so rather than inventing a
        # reason the recommendation is still right.
        return (f"{name} actually projects {abs(gap):.1f} more than {top['web_name']} "
                f"over the next gameweek - it is close enough to be your call.")
    else:
        lead = f"{name} projects the same as {top['web_name']}"

    haul_top = top.get("haul_probability")
    haul_alt = alternative.get("haul_probability")
    if haul_top is not None and haul_alt is not None:
        top_pct, alt_pct = round(haul_top * 100), round(haul_alt * 100)
        if alt_pct > top_pct:
            return (f"{lead}, though he is likelier to haul ({alt_pct}% against {top_pct}%) - "
                    f"the safer points are on {top['web_name']}, the bigger ceiling on {name}.")
        if alt_pct < top_pct:
            return f"{lead}, and is less likely to haul ({alt_pct}% against {top_pct}%)."
    return f"{lead}."


def why_not_take_a_hit(free_gain, hit_gain, extra_transfers=1, gw_count=5):
    """
    Whether the extra transfer pays for itself.

    `free_gain` and `hit_gain` are the projected totals for the best plan within
    the free allowance and the best plan one transfer beyond it, over the same
    horizon.

    The arithmetic that looks obvious here is wrong, and it is the same error
    optimize_transfers exists to avoid: comparing a five-gameweek gain against a
    one-off four-point cost. That reads a move worth +1 a week as +5 against -4
    and calls it worth it, which is how "nine transfers, -32 points" advice gets
    produced. The flaw is that it ignores next week's free transfer - you are
    not choosing between having the player and never having him, you are
    choosing between having him now and having him in seven days for nothing.

    So the hit buys roughly one gameweek of the advantage, and that is what it
    has to beat. The comparison is the per-gameweek gain against the four
    points, and the horizon total is reported alongside it so a manager can see
    both numbers and disagree if they think the player's edge is front-loaded.

    Deliberately conservative. Being talked out of a marginal hit costs a
    manager a point or two; being talked into a bad one costs four, every time.
    """
    cost = POINTS_PER_HIT * extra_transfers
    gross = round(hit_gain - free_gain, 1)
    per_week = round(gross / gw_count, 1) if gw_count else gross

    if gross <= 0:
        return (f"No: the extra transfer does not improve the squad at all over {gw_count} "
                f"gameweeks, before the {cost}-point hit is even counted.")
    if per_week > cost:
        return (f"Worth it: the second move is worth about {per_week:.1f} points a gameweek "
                f"({gross:.1f} over {gw_count}), which clears the {cost}-point hit in the first "
                f"week alone.")
    return (f"No: the second move is worth about {per_week:.1f} points a gameweek "
            f"({gross:.1f} over {gw_count}), and a {cost}-point hit needs to be repaid before "
            f"next week's free transfer would have made the same move for nothing.")


def why_not_chip_now(chip_name, this_week, best_week, best_event):
    """
    Why a chip is being held rather than played this week.

    `this_week` and `best_week` are the chip's projected value now and in the
    best week scanned - bench points for a Bench Boost, the captain's projected
    return for a Triple Captain, and so on.

    A chip is a once-a-season decision, so the honest comparison is against the
    best week available rather than against a threshold. If this week *is* the
    best week, that is the answer.
    """
    gain = round(best_week - this_week, 1)
    if gain <= 0.1:
        return f"This is the week - nothing scanned beats it for {chip_name}."
    return (f"{chip_name} is worth {this_week:.1f} this week and {best_week:.1f} in GW{best_event}. "
            f"Holding it gains you {gain:.1f}, and it is only playable once.")
