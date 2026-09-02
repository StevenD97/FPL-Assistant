"""
One line of plain English for every recommendation.

A number on its own is not advice. "Gvardiol -> Truffert" and "+2.4" tell a
manager what the model concluded but nothing about why, so there is no way to
agree or disagree with it - which means there is no way to trust it. Every
sentence built here is derived from figures the model already computed and
already shows; none of it is generated prose, and none of it asserts anything
the caller doesn't have the numbers for.

Kept in one module so the phrasing stays consistent across transfers,
captaincy and chips, and so the wording can be changed in one place rather
than in three components' JSX.
"""

STATUS_WORDS = {
    "d": "a doubt",
    "i": "injured",
    "s": "suspended",
    "u": "unavailable",
    "n": "not in the squad",
}


def _gw_phrase(gw_count):
    return "the next gameweek" if gw_count == 1 else f"the next {gw_count} gameweeks"


def _first_fixtures(ticker, limit=3):
    """The first few opponents from a fixture ticker like "COV(H) | HUL(A) | ..."."""
    if not ticker:
        return ""
    parts = [p.strip() for p in str(ticker).split("|") if p.strip()]
    return ", ".join(parts[:limit])


def _expected_starts(player, gw_count):
    """appearance_points over the window, read back as "full matches expected"."""
    points = player.get("appearance_points")
    if points is None:
        return None
    return min(float(points) / 2, float(gw_count))


def _join(clauses):
    """"a", "a and b", "a, b, and c" - so a three-part reason still reads as a sentence."""
    if not clauses:
        return ""
    if len(clauses) == 1:
        return clauses[0]
    if len(clauses) == 2:
        return f"{clauses[0]} and {clauses[1]}"
    return ", ".join(clauses[:-1]) + f", and {clauses[-1]}"


def transfer_reason(player_in, player_out, gw_count):
    """
    Why this swap, in one or two sentences.

    A flagged player being replaced leads, on its own, because that is the
    transfer a manager would have made anyway and it explains the swap by
    itself. The rest is the case for the incoming player: the points
    difference the optimiser actually maximised, who he faces, and what it
    does to the bank.
    """
    gained = round(player_in["predicted_points"] - player_out["predicted_points"], 1)
    sentences = []

    status = (player_out.get("status") or "a").lower()
    if status in STATUS_WORDS:
        sentences.append(f"{player_out['web_name']} is {STATUS_WORDS[status]}.")

    clauses = []
    if gained > 0:
        clauses.append(f"is worth {gained:+.1f} pts more over {_gw_phrase(gw_count)}")
    elif gained < 0:
        # Can happen when the swap is forced by availability or by budget.
        clauses.append(f"projects {gained:+.1f} pts over {_gw_phrase(gw_count)} but is available")
    else:
        clauses.append(f"projects the same over {_gw_phrase(gw_count)}")

    # Expected starts, where the two differ enough to be the real reason.
    # FPL pays 1 appearance point for playing and 2 for sixty minutes or more,
    # so appearance_points over a window is close to "how many of these
    # gameweeks does the model expect a full match from him". For most swaps
    # this, not the fixtures, is what actually separates the two players -
    # a rotation risk projects half the points of an ever-present at the same
    # price - and it is the part a manager most wants to argue with.
    starts_in = _expected_starts(player_in, gw_count)
    starts_out = _expected_starts(player_out, gw_count)
    if starts_in is not None and starts_out is not None and starts_in - starts_out >= 0.5:
        clauses.append(
            f"is projected to start {starts_in:.1f} of the next {gw_count} "
            f"against {player_out['web_name']}'s {starts_out:.1f}"
        )

    fixtures = _first_fixtures(player_in.get("fixture_ticker"))
    if fixtures:
        clauses.append(f"faces {fixtures}")

    cost_in = player_in.get("now_cost")
    cost_out = player_out.get("now_cost")
    if cost_in is not None and cost_out is not None:
        delta = (cost_in - cost_out) / 10
        if delta <= -0.1:
            clauses.append(f"frees £{abs(delta):.1f}m")
        elif delta >= 0.1:
            clauses.append(f"costs £{delta:.1f}m more")

    sentences.append(f"{player_in['web_name']} {_join(clauses)}.")
    return " ".join(sentences)


def captain_reason(option, current_captain_name=None, runner_up=None):
    """Why this armband, in one sentence."""
    points = option.get("predicted_points_next")
    opponent = option.get("next_opponent")
    parts = []
    if points is not None:
        parts.append(f"{points:.1f} pts projected")
    if opponent and opponent != "BLANK":
        # "EVE(A)" already carries the venue - saying "away to EVE(A)" says it
        # twice, so the suffix comes off when it's spelled out in words.
        if opponent.endswith("(H)"):
            parts.append(f"at home to {opponent[:-3]}")
        elif opponent.endswith("(A)"):
            parts.append(f"away at {opponent[:-3]}")
        else:
            parts.append(f"vs {opponent}")
    lead = " ".join(parts) if parts else f"{option['web_name']} is the model's pick"

    if runner_up is not None and runner_up.get("predicted_points_next") is not None:
        margin = round(points - runner_up["predicted_points_next"], 1)
        if margin >= 0.1:
            lead += f", {margin:.1f} clear of {runner_up['web_name']}"
        else:
            lead += f", level with {runner_up['web_name']}"

    if current_captain_name and current_captain_name != option["web_name"]:
        lead += f" - you have {current_captain_name}"
    return lead + "."


def bench_boost_reason(row):
    return (
        f"Your bench projects {row['bench_score']:.1f} pts in GW{row['event']}, "
        f"the most of any week scanned."
    )


def triple_captain_reason(row):
    return (
        f"{row['best_captain_name']} projects {row['best_captain_score']:.1f} pts in "
        f"GW{row['event']}, the highest single-gameweek score in your squad across the scan."
    )


def free_hit_reason(row):
    blanks = int(row["blank_count"])
    if blanks == 0:
        return "No gameweek in the scan leaves enough of your squad without a fixture to be worth a Free Hit."
    return (
        f"{blanks} of your 15 have no fixture in GW{row['event']} - "
        f"{'enough to be worth a Free Hit' if blanks >= 3 else 'not enough to be worth a Free Hit yet'}."
    )


def comparison_reason(player, better, gw_count):
    """
    Why the model prefers `better` to `player`, or why `player` is fine.

    The mirror image of transfer_reason: that one argues for a swap the model
    chose, this one answers "what about X?" for a player it didn't choose. The
    question is the most common one a manager actually has - a list of who to
    buy never says anything about the player they were already thinking of -
    and it has to be answerable for anyone, not only for the handful the model
    happens to rank highly.
    """
    if better is None:
        return (
            f"Nothing in {player['web_name']}'s position at or under "
            f"£{player['cost']:.1f}m projects higher over {_gw_phrase(gw_count)}. "
            f"By this model, they are the pick at that price."
        )

    clauses = []
    gap = round(better["predicted_points"] - player["predicted_points"], 1)
    if gap > 0:
        clauses.append(f"projects {gap:+.1f} pts more over {_gw_phrase(gw_count)}")

    starts_better = _expected_starts(better, gw_count)
    starts_player = _expected_starts(player, gw_count)
    if starts_better is not None and starts_player is not None and starts_better - starts_player >= 0.5:
        clauses.append(
            f"is projected to start {starts_better:.1f} of the next {gw_count} "
            f"against {player['web_name']}'s {starts_player:.1f}"
        )

    fixtures = _first_fixtures(better.get("fixture_ticker"))
    if fixtures:
        clauses.append(f"faces {fixtures}")

    delta = better["cost"] - player["cost"]
    if delta <= -0.1:
        # No leading "and" - _join supplies the conjunction.
        clauses.append(f"costs £{abs(delta):.1f}m less")
    elif delta >= 0.1:
        clauses.append(f"costs £{delta:.1f}m more")

    if not clauses:
        return (
            f"{better['web_name']} edges it, but only just - there is very little "
            f"between them over {_gw_phrase(gw_count)}."
        )
    return f"{better['web_name']} {_join(clauses)}."
