"""
Cross-season element (player) id remapping, matched by FPL's stable `code`
field. `id` is NOT stable — FPL recompacts/reassigns it every season — so any
join across a season boundary has to go through `code`. Pure; no dependencies.
"""


def map_player_stats_to_roster(stats_by_element, training_elements, roster_elements):
    """
    Remaps a dict keyed by *training*-season element (player) ids to
    *roster*-season element ids, matching by FPL's `code` field - the
    actually-stable per-player identifier across seasons. `id` is NOT
    stable: FPL recompacts/reassigns it every season, the same failure
    mode this file already handles for team ids, just for players
    instead - confirmed empirically: of the 555 element ids in the live
    2026/27 roster that also happen to exist as ids in the 2025/26
    archive, 550 refer to a *different* real player once compared by
    code (e.g. id 303 was James Garner at Everton in 2025/26, is Cédric
    Kipré at Ipswich in 2026/27 - a promoted club with zero 2025/26 top-
    flight history of its own). Trusting `id` directly here silently
    attributed a random departed player's history to whichever new
    player inherited their old numeric id.

    Players with no code match (genuinely new to the Premier League, or
    who left it) are simply absent from the result - every caller
    already falls back to "no history" defaults for any element id with
    no entry, which is the honest answer for a player with no top-flight
    record in the training archive.
    """
    code_to_training_id = {p["code"]: p["id"] for p in training_elements}
    remapped = {}
    for p in roster_elements:
        training_id = code_to_training_id.get(p["code"])
        if training_id is not None and training_id in stats_by_element:
            remapped[p["id"]] = stats_by_element[training_id]
    return remapped


def resolve_live_to_training_id(live_id, live_elements, training_elements):
    """
    Single-player version of the code-matching remap used throughout for
    live-roster predictions (see map_player_stats_to_roster) - returns the
    training-season element id for a given live-season element id, matched
    by FPL's stable `code` field (element `id` itself gets recompacted every
    season and is not safe to use directly - see that function's docstring).
    Returns None if the player has no top-flight record in the training
    archive (a new signing, or a promoted club's player) - the honest
    answer, not a guess.
    """
    live_player = next((p for p in live_elements if p["id"] == live_id), None)
    if live_player is None:
        return None
    code_to_training_id = {p["code"]: p["id"] for p in training_elements}
    return code_to_training_id.get(live_player["code"])
