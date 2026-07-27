"""
Player-level model inputs derived from personal gameweek history: each
player's share of their team's expected goals/assists, appearance
probabilities, recency-weighted per-match rates for the personal-history
scoring categories, and a live availability multiplier — each with its
cross-season blended sequel for once the current season has results.
"""
from fpl.data.loaders import load_gw_history
from fpl.domain.recency import compute_recency_weighted_stat, recency_weights
from fpl.model.ids import map_player_stats_to_roster
from fpl.model.rules import (
    CROSS_SEASON_HALF_LIFE_DAYS,
    HISTORY_STAT_COLUMNS,
    MIN_APPEARANCE_WEIGHT_FOR_POSITION_PRIOR,
    SHARE_SMOOTHING_ALPHA,
    SHRINKAGE_GAMES,
)
from fpl.model.strengths import _blend_dicts, _blend_weight, _current_season_gws_played


def compute_player_involvement_shares(reference_date, half_life_days=21, season="2025_26",
                                       smoothing_alpha=SHARE_SMOOTHING_ALPHA):
    """
    element -> {goal_share, assist_share}: this player's recency-weighted
    share of their own team's total *expected* goals/assists (xG/xA, not
    actual goals/assists). Used to split a predicted team goal tally down
    to individual players.

    Two deliberate departures from a naive "player's goals / team's goals"
    ratio, both aimed at the same failure mode - see SHARE_SMOOTHING_ALPHA's
    comment for the real example that motivated this:

    1. xG/xA instead of actual goals/assists. Actual goals/assists are
       small-integer outcome counts that bake in finishing variance -
       whether a teammate's shot off *this* player's chance actually went
       in is partly luck, and luck regresses to the mean. xG/xA (FPL's own
       Opta-sourced per-shot/per-chance quality estimates, already in
       gw_history) measure the underlying chance *created*, which is far
       more stable and more predictive of future output - standard
       practice in football analytics (see README/commit notes for the
       Bruno Fernandes case this was found from: 24 actual assists vs
       12.3 xA over the same games - a meaningfully smaller, more honest
       number even before any smoothing).
    2. Additive smoothing toward a *position-average* share (see
       SHARE_SMOOTHING_ALPHA), not a flat one. Without this, a share is
       trusted 100% no matter how little of the team's *total* xG/xA it's
       estimated from - team-level total xG/xA over a recency-weighted
       window is itself a small number (a team generates maybe 1-2 xA a
       match), so even a full season of evidence for the PLAYER doesn't
       mean there's much evidence for the DISTRIBUTION across the squad.
       This is a different failure mode than sparse per-player data
       (which half_life_days/recency weighting already handles) - it's
       about how much total signal exists to trust a concentrated split
       at all. The prior must be position-specific, not a flat "even
       split among the team's outfield players": a first attempt at this
       used one flat prior across DEF/MID/FWD alike, and it systematically
       over-predicted defenders (backtest MAE got worse, bias flipped from
       -0.04 to +0.28) by pulling their genuinely-low goal/assist
       involvement up toward attackers' higher one. League-average
       goal_share/assist_share by position (DEF ~0.02/0.03, MID ~0.04/0.06,
       FWD ~0.11/0.03 - a forward's primary job is scoring, not creating,
       hence the lower assist_share than MID despite the higher goal_share)
       fixes that: shrinkage now pulls a player toward what's typical for
       *their own position*, not the outfield average. Goalkeepers are
       excluded entirely (both as smoothing recipients and from the prior
       pool) - real goalkeeper goal/assist involvement is indistinguishable
       from zero (0.16 expected_goals and 1.40 expected_assists *combined
       across the entire archive, every GK, every team, full season*), so
       even a position-specific prior would be manufacturing threat from
       nothing; their raw (still xG/xA-based, just unsmoothed) ratio
       already correctly comes out near-zero.
    """
    history = load_gw_history(season)
    past = history[history["kickoff_time"] < reference_date].copy()
    if past.empty:
        return {}

    past["weight"] = recency_weights(past["kickoff_time"], reference_date, half_life_days)
    past["weighted_goals"] = past["weight"] * past["expected_goals"]
    past["weighted_assists"] = past["weight"] * past["expected_assists"]
    past["appeared"] = past["minutes"] > 0

    team_goals = past.groupby("team_id")["weighted_goals"].sum()
    team_assists = past.groupby("team_id")["weighted_assists"].sum()
    player_goals = past.groupby("element")["weighted_goals"].sum()
    player_assists = past.groupby("element")["weighted_assists"].sum()
    player_team = past.groupby("element")["team_id"].last()
    player_position = past.groupby("element")["position"].last()
    # Total recency-weighted evidence (appearance weight) behind each
    # player's raw share - only players with a meaningful amount feed the
    # position-average prior below, so a deadline-day debutant's ~0 raw
    # share (1 substitute appearance, nothing to show for it yet) doesn't
    # drag the whole position's "typical" share down for everyone.
    appearance_weight = past[past["appeared"]].groupby("element")["weight"].sum()

    def raw_share(element, team_id, stat_totals, player_stat):
        total = stat_totals.get(team_id, 0.0)
        return player_stat.get(element, 0.0) / total if total else 0.0

    position_priors = {}
    for pos in ["DEF", "MID", "FWD"]:
        pos_elements = [
            e for e, p in player_position.items()
            if p == pos and appearance_weight.get(e, 0.0) >= MIN_APPEARANCE_WEIGHT_FOR_POSITION_PRIOR
        ]
        goal_shares = [raw_share(e, player_team[e], team_goals, player_goals) for e in pos_elements]
        assist_shares = [raw_share(e, player_team[e], team_assists, player_assists) for e in pos_elements]
        position_priors[pos] = {
            "goal_share": sum(goal_shares) / len(goal_shares) if goal_shares else 0.0,
            "assist_share": sum(assist_shares) / len(assist_shares) if assist_shares else 0.0,
        }

    shares = {}
    for element, team_id in player_team.items():
        position = player_position.get(element)
        prior = position_priors.get(position)
        team_goal_total = team_goals.get(team_id, 0.0)
        team_assist_total = team_assists.get(team_id, 0.0)
        if prior is None:  # GK, or an unrecognized position - no smoothing, see docstring
            shares[element] = {
                "goal_share": raw_share(element, team_id, team_goals, player_goals),
                "assist_share": raw_share(element, team_id, team_assists, player_assists),
            }
            continue
        shares[element] = {
            "goal_share": (player_goals.get(element, 0.0) + smoothing_alpha * prior["goal_share"])
            / (team_goal_total + smoothing_alpha),
            "assist_share": (player_assists.get(element, 0.0) + smoothing_alpha * prior["assist_share"])
            / (team_assist_total + smoothing_alpha),
        }
    return shares


def compute_appearance_probabilities(reference_date, half_life_days=21, season="2025_26"):
    """
    element -> {p_any, p_60_plus}: recency-weighted historical rate of
    playing any minutes / playing 60+ minutes. Drives appearance points
    and gates every other per-appearance category (a player who isn't
    on the pitch can't earn a defensive contribution bonus, save, etc).
    """
    history = load_gw_history(season)
    past = history[history["kickoff_time"] < reference_date].copy()
    if past.empty:
        return {}

    past["weight"] = recency_weights(past["kickoff_time"], reference_date, half_life_days)
    past["played_any"] = (past["minutes"] > 0).astype(float)
    past["played_60_plus"] = (past["minutes"] >= 60).astype(float)

    weight_sum = past.groupby("element")["weight"].sum()
    p_any = (past["played_any"] * past["weight"]).groupby(past["element"]).sum() / weight_sum
    p_60_plus = (past["played_60_plus"] * past["weight"]).groupby(past["element"]).sum() / weight_sum

    return {
        element: {"p_any": p_any.get(element, 0.0), "p_60_plus": p_60_plus.get(element, 0.0)}
        for element in weight_sum.index
    }


def compute_live_availability(bootstrap):
    """
    element -> availability multiplier in [0, 1], from FPL's own
    chance_of_playing_next_round/status fields on whichever bootstrap was
    loaded - a same-week injury/suspension signal that compute_appearance_probabilities
    (built entirely from historical minutes) has no way to see on its own.

    This only reflects reality when `bootstrap` is a genuinely current
    snapshot - see predict_player_points' apply_live_signals parameter
    for why it isn't applied unconditionally (the archived 2025/26
    snapshot's status fields are frozen at end-of-season, not accurate
    for an arbitrary earlier gameweek being backtested/demoed).
    """
    availability = {}
    for player in bootstrap["elements"]:
        chance = player.get("chance_of_playing_next_round")
        status = player.get("status")
        if chance is not None:
            availability[player["id"]] = chance / 100
        elif status in ("i", "s", "u", "n"):  # injured/suspended/unavailable/not-in-squad, no % given
            availability[player["id"]] = 0.0
        else:
            availability[player["id"]] = 1.0
    return availability


def compute_personal_history_rates(reference_date, half_life_days=21, season="2025_26"):
    """element -> {stat_name: recency-weighted per-match average} for every HISTORY_STAT_COLUMNS entry."""
    rates_by_stat = {
        stat: compute_recency_weighted_stat(reference_date, stat, half_life_days, season)
        for stat in HISTORY_STAT_COLUMNS
    }
    all_elements = set()
    for rates in rates_by_stat.values():
        all_elements.update(rates.keys())
    return {
        element: {stat: rates_by_stat[stat].get(element, 0.0) for stat in HISTORY_STAT_COLUMNS}
        for element in all_elements
    }


def compute_player_involvement_shares_blended(reference_date, half_life_days=21,
                                               archive_season="2025_26", current_season="2026_27",
                                               archive_half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
                                               shrinkage_games=SHRINKAGE_GAMES,
                                               smoothing_alpha=SHARE_SMOOTHING_ALPHA,
                                               archive_elements=None, roster_elements=None):
    """Blended sequel to compute_player_involvement_shares - see compute_team_goal_strengths_blended's docstring
    for the general shape (identical pre-season behaviour, shrinkage-weighted blend once current_season has games).
    archive_elements/roster_elements, if given, are the two seasons' bootstrap["elements"] lists, for the
    by-`code` remap (map_player_stats_to_roster) before blending - player element ids also get reassigned yearly."""
    archive_shares = compute_player_involvement_shares(reference_date, archive_half_life_days, archive_season,
                                                         smoothing_alpha)
    if archive_elements is not None and roster_elements is not None:
        archive_shares = map_player_stats_to_roster(archive_shares, archive_elements, roster_elements)

    weight = _blend_weight(_current_season_gws_played(reference_date, current_season), shrinkage_games)
    if weight == 0.0:
        return archive_shares

    current_shares = compute_player_involvement_shares(reference_date, half_life_days, current_season, smoothing_alpha)
    default = {"goal_share": 0.0, "assist_share": 0.0}
    return _blend_dicts(archive_shares, current_shares, weight, ["goal_share", "assist_share"], default)


def compute_appearance_probabilities_blended(reference_date, half_life_days=21,
                                              archive_season="2025_26", current_season="2026_27",
                                              archive_half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
                                              shrinkage_games=SHRINKAGE_GAMES,
                                              archive_elements=None, roster_elements=None):
    """Blended sequel to compute_appearance_probabilities - see compute_team_goal_strengths_blended's docstring."""
    archive_probs = compute_appearance_probabilities(reference_date, archive_half_life_days, archive_season)
    if archive_elements is not None and roster_elements is not None:
        archive_probs = map_player_stats_to_roster(archive_probs, archive_elements, roster_elements)

    weight = _blend_weight(_current_season_gws_played(reference_date, current_season), shrinkage_games)
    if weight == 0.0:
        return archive_probs

    current_probs = compute_appearance_probabilities(reference_date, half_life_days, current_season)
    default = {"p_any": 0.0, "p_60_plus": 0.0}
    return _blend_dicts(archive_probs, current_probs, weight, ["p_any", "p_60_plus"], default)


def compute_personal_history_rates_blended(reference_date, half_life_days=21,
                                            archive_season="2025_26", current_season="2026_27",
                                            archive_half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
                                            shrinkage_games=SHRINKAGE_GAMES,
                                            archive_elements=None, roster_elements=None):
    """Blended sequel to compute_personal_history_rates - see compute_team_goal_strengths_blended's docstring."""
    archive_rates = compute_personal_history_rates(reference_date, archive_half_life_days, archive_season)
    if archive_elements is not None and roster_elements is not None:
        archive_rates = map_player_stats_to_roster(archive_rates, archive_elements, roster_elements)

    weight = _blend_weight(_current_season_gws_played(reference_date, current_season), shrinkage_games)
    if weight == 0.0:
        return archive_rates

    current_rates = compute_personal_history_rates(reference_date, half_life_days, current_season)
    default = {stat: 0.0 for stat in HISTORY_STAT_COLUMNS}
    return _blend_dicts(archive_rates, current_rates, weight, HISTORY_STAT_COLUMNS, default)
