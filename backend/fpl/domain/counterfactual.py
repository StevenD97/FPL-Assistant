"""
What ignoring the model actually cost you, in your own points.

The accuracy page proves the model is worth listening to in general. This
answers the sharper question - was it worth listening to *for you, last week* -
and it is a different kind of evidence. "Our captain picks average 12.5 points"
is a statistic about a stranger's team. "You captained Palmer, we said
B.Fernandes, and that decision cost you 26 points" is about yours, and a
manager will remember the second one.

Only the armband is graded here, deliberately. Captaincy is the one decision
where the counterfactual is clean: the same eleven players either way, one of
them doubled, so the difference is exactly twice the gap between two scores.
Transfers are not clean - a transfer you did not make changes the squad for
every week after it, chains into the next transfer, and its "cost" depends on
how long you would have held the player. Reporting a number that precise about
something that tangled would be false precision of the worst kind: confident,
personal, and wrong.

Scored honestly in both directions. When the manager's own pick beat the
model's, that is reported as plainly as when it lost - a record that only
surfaces the weeks it was right is an advertisement, not a record.
"""

# The captain's multiplier. Triple Captain is read from the pick itself rather
# than assumed, because a week where a manager tripled is exactly the week this
# number matters most.
DEFAULT_CAPTAIN_MULTIPLIER = 2


def captain_counterfactual(model_pick, actual_pick, points_by_element, multiplier=None):
    """
    What the armband did, against what the model said, for one gameweek.

    `model_pick` and `actual_pick` are {"id", "web_name"} for the model's top
    captaincy option and the player the manager actually captained.
    `points_by_element` maps element id -> points that gameweek.

    Returns None when either player cannot be scored - a manager with no team
    that week, or an id missing from the live data - rather than guessing at a
    zero, which would read as "your captain blanked" when the truth is "we do
    not know".
    """
    if not model_pick or not actual_pick:
        return None
    model_id, actual_id = model_pick.get("id"), actual_pick.get("id")
    if model_id not in points_by_element or actual_id not in points_by_element:
        return None

    multiplier = multiplier or DEFAULT_CAPTAIN_MULTIPLIER
    model_points = points_by_element[model_id]
    actual_points = points_by_element[actual_id]
    # Both players are in the eleven either way; only the doubling moves. So
    # the swing is the gap times the extra multiple, not times the multiplier.
    delta = (model_points - actual_points) * (multiplier - 1)

    return {
        "model_pick": model_pick.get("web_name"),
        "model_points": int(model_points),
        "your_pick": actual_pick.get("web_name"),
        "your_points": int(actual_points),
        "multiplier": multiplier,
        # Positive: following the model would have gained you this much.
        # Negative: your own call was the better one.
        "points_delta": int(delta),
        "agreed": model_id == actual_id,
        "verdict": _verdict(model_id == actual_id, delta),
    }


def _verdict(agreed, delta):
    """One sentence, written the same way whichever direction it went."""
    if agreed:
        return "You and the model picked the same captain."
    if delta > 0:
        return f"Following the model would have gained you {int(delta)} points."
    if delta < 0:
        return f"Your own call beat the model by {abs(int(delta))} points."
    return "Different captains, identical returns - it made no difference."
