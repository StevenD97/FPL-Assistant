"""
Player-level predicted_points: the per-fixture points decomposition
(_fixture_points), the cached per-request context, and the single- and
multi-gameweek prediction entry points.

This is a second, independent estimate from fpl.domain.scoring's
recommendation_score — comparing the two is the point. It covers the full FPL
2025/26 scoring system: appearance, goals/assists (split from predicted team
goals by each player's historical involvement share), clean sheets/goals
conceded (from the opponent's predicted xG via Poisson), and the personal-
history categories (bonus, saves, cards, own goals, defensive contribution).

Approximations worth knowing about:
  - Bonus points are a flat recency-weighted average rather than a simulation
    of the BPS system (which would need every player's per-match stats) - a
    fixture-dominance-scaled version was tried and rejected on walk-forward
    evidence, see rules.BONUS_FIXTURE_SENSITIVITY's docstring.
  - Defensive contribution and saves assume the underlying count is Poisson-
    distributed with the recency-weighted average as its rate.
  - Team attack/defence strength (fpl.model.strengths) is trained on a blend
    of actual goals and team-aggregated expected goals, not raw goals alone -
    see rules.TEAM_XG_WEIGHT's docstring for why.
"""
from functools import lru_cache

import pandas as pd

from fpl.data.loaders import load_bootstrap, load_fixtures
from fpl.domain.fixtures import build_fixtures_by_team_event, compute_congestion
from fpl.model.involvement import (
    compute_appearance_probabilities,
    compute_appearance_probabilities_blended,
    compute_live_availability,
    compute_personal_history_rates,
    compute_personal_history_rates_blended,
    compute_player_involvement_shares,
    compute_player_involvement_shares_blended,
)
from fpl.model.distribution import convolve, fixture_outcome_distribution, summarise
from fpl.model.rules import (
    APPEARANCE_POINTS_60_PLUS,
    APPEARANCE_POINTS_ANY,
    ASSIST_POINTS,
    BONUS_FIXTURE_SENSITIVITY,
    CLEAN_SHEET_POINTS,
    CONGESTION_APPEARANCE_WEIGHT,
    CONGESTION_WINDOW_DAYS,
    CORNER_TAKER_ASSIST_SHARE_BOOST,
    DEFENSIVE_CONTRIBUTION_POINTS,
    DEFENSIVE_CONTRIBUTION_THRESHOLD,
    FREEKICK_TAKER_GOAL_SHARE_BOOST,
    GOAL_POINTS,
    GOALS_CONCEDED_DIVISOR,
    GOALS_CONCEDED_PENALTY,
    HISTORY_STAT_COLUMNS,
    OWN_GOAL_POINTS,
    PENALTY_MISS_POINTS,
    PENALTY_SAVE_POINTS,
    PENALTY_TAKER_GOAL_SHARE_BOOST,
    RED_CARD_POINTS,
    SAVE_DIVISOR,
    SAVE_POINTS,
    SHARE_SMOOTHING_ALPHA,
    SHRINKAGE_GAMES,
    TEAM_XG_WEIGHT,
    YELLOW_CARD_POINTS,
    _poisson_expected_floor_division,
    _poisson_prob_at_least,
)
from fpl.model.strengths import (
    clean_sheet_probability,
    compute_team_goal_strengths,
    compute_team_goal_strengths_blended,
    predict_fixture_xg,
)


def _fixture_points(position, team_xg, opp_xg, share, appearance, history_rates, bonus_fixture_sensitivity=0.0):
    """Every scoring category's expected points for one player, one fixture."""
    p_any = appearance["p_any"]
    p_60_plus = appearance["p_60_plus"]

    predicted_goals = team_xg * share["goal_share"]
    predicted_assists = team_xg * share["assist_share"]
    cs_prob = clean_sheet_probability(opp_xg)

    appearance_points = p_any * APPEARANCE_POINTS_ANY + p_60_plus * (APPEARANCE_POINTS_60_PLUS - APPEARANCE_POINTS_ANY)
    goal_points = predicted_goals * GOAL_POINTS.get(position, 4)
    assist_points = predicted_assists * ASSIST_POINTS

    clean_sheet_points = 0.0
    goals_conceded_points = 0.0
    if position in ("GKP", "DEF"):
        # Clean sheet / conceded-goals points require 60+ minutes.
        clean_sheet_points = cs_prob * CLEAN_SHEET_POINTS.get(position, 0) * p_60_plus
        goals_conceded_points = (
            GOALS_CONCEDED_PENALTY * _poisson_expected_floor_division(opp_xg, GOALS_CONCEDED_DIVISOR) * p_60_plus
        )

    # Personal-history categories, gated by probability of playing at all.
    # Bonus additionally scales with how favourable THIS fixture looks
    # (team_xg vs opp_xg) rather than applying a flat season average to
    # every fixture regardless of opponent - see BONUS_FIXTURE_SENSITIVITY.
    fixture_dominance = team_xg - opp_xg
    bonus_multiplier = max(0.4, 1 + bonus_fixture_sensitivity * fixture_dominance)
    bonus_points = history_rates["bonus"] * p_any * bonus_multiplier
    save_points = SAVE_POINTS * (history_rates["saves"] / SAVE_DIVISOR) * p_any if position == "GKP" else 0.0
    penalty_save_points = PENALTY_SAVE_POINTS * history_rates["penalties_saved"] * p_any if position == "GKP" else 0.0
    penalty_miss_points = PENALTY_MISS_POINTS * history_rates["penalties_missed"] * p_any
    card_points = (
        YELLOW_CARD_POINTS * history_rates["yellow_cards"] + RED_CARD_POINTS * history_rates["red_cards"]
    ) * p_any
    own_goal_points = OWN_GOAL_POINTS * history_rates["own_goals"] * p_any

    defensive_contribution_points = 0.0
    dc_prob = 0.0
    threshold = DEFENSIVE_CONTRIBUTION_THRESHOLD.get(position)
    if threshold is not None:
        dc_prob = _poisson_prob_at_least(history_rates["defensive_contribution"], threshold)
        defensive_contribution_points = DEFENSIVE_CONTRIBUTION_POINTS * dc_prob * p_any

    total_points = (
        appearance_points + goal_points + assist_points + clean_sheet_points + goals_conceded_points
        + bonus_points + save_points + penalty_save_points + penalty_miss_points + card_points
        + own_goal_points + defensive_contribution_points
    )

    # The same components, kept as a distribution rather than collapsed to
    # their mean. A haul is a tail event and an expectation cannot express one
    # - see fpl.model.distribution for the backtest evidence and the reasoning.
    minor = (
        goals_conceded_points + save_points + penalty_save_points
        + penalty_miss_points + card_points + own_goal_points
    )
    outcome = fixture_outcome_distribution(
        position, predicted_goals, predicted_assists, appearance, cs_prob,
        dc_prob if threshold is not None else 0.0,
        expected_bonus=bonus_points, expected_minor_points=minor,
    )

    return {
        "predicted_points": total_points,
        # Carried out rather than summarised here: across a double gameweek
        # the two fixtures' distributions have to be convolved before the
        # haul threshold means anything. See convolve().
        "outcome_distribution": outcome,
        "predicted_goals": predicted_goals,
        "predicted_assists": predicted_assists,
        "clean_sheet_prob": cs_prob,
        "appearance_points": appearance_points,
        "goal_points": goal_points,
        "assist_points": assist_points,
        "clean_sheet_points": clean_sheet_points,
        "goals_conceded_points": goals_conceded_points,
        "bonus_points": bonus_points,
        "save_points": save_points,
        "penalty_save_points": penalty_save_points,
        "penalty_miss_points": penalty_miss_points,
        "card_points": card_points,
        "own_goal_points": own_goal_points,
        "defensive_contribution_points": defensive_contribution_points,
    }


_BREAKDOWN_KEYS = [
    "predicted_points", "predicted_goals", "predicted_assists", "clean_sheet_prob",
    "appearance_points", "goal_points", "assist_points", "clean_sheet_points",
    "goals_conceded_points", "bonus_points", "save_points", "penalty_save_points",
    "penalty_miss_points", "card_points", "own_goal_points", "defensive_contribution_points",
]


def predict_player_points(reference_date, next_event, half_life_days=21, season="2025_26",
                           bootstrap_file="bootstrap_static_2025_26_final.json",
                           fixtures_file="fixtures_2025_26_final.json",
                           shrinkage_games=SHRINKAGE_GAMES, apply_live_signals=False,
                           roster_bootstrap_file=None, roster_fixtures_file=None,
                           current_season="2026_27", smoothing_alpha=SHARE_SMOOTHING_ALPHA,
                           xg_weight=TEAM_XG_WEIGHT, congestion_weight=CONGESTION_APPEARANCE_WEIGHT,
                           bonus_fixture_sensitivity=BONUS_FIXTURE_SENSITIVITY):
    """
    Returns a DataFrame, one row per player, with predicted_points for
    their next fixture(s) and every category it's built from (see
    _fixture_points) - covering the full FPL 2025/26 scoring system.

    bootstrap_file/fixtures_file default to the archived 2025/26 season,
    matching `season` - all of team_strengths/involvement/appearance/
    history_rates are trained on that archive, and FPL reassigns team
    ids alphabetically every season (team id 3 was Burnley in 2025/26,
    is Bournemouth in 2026/27), so pointing bootstrap_file/fixtures_file
    at a *different* season than `season` would silently apply one
    team's learned attack/defence ratios to a different team's fixtures.
    Keep all three in sync.

    roster_bootstrap_file/roster_fixtures_file let *who the players are*
    (identity/team/price/fixtures/live status) come from a newer
    snapshot than the one the model is trained on. Default None means
    "same as bootstrap_file/fixtures_file" (today's archived-only
    behaviour, unchanged - see the eval tools in tools/, which never set
    this). When set, training also blends in current_season's own
    gw_history once it has any (see compute_team_goal_strengths_blended
    and friends) - before current_season has a single finished gameweek
    before reference_date (true for every request made before 2026/27 GW1
    is actually played), the blend weight is exactly 0 and this is
    identical to the archive-only + by-name/by-code roster remap this
    already did (_remap_team_strengths_to_roster/
    map_player_stats_to_roster) - neither id is stable across a season
    boundary on its own, which is why those remaps exist at all.

    apply_live_signals=True layers two of the roster bootstrap's own
    fields on top of the gw_history-trained numbers above: live
    injury/suspension status (compute_live_availability) scales
    appearance probability, and current primary set-piece duty boosts
    goal_share/assist_share. Defaults to False, and the eval tools never
    set it: bootstrap_file is a single frozen snapshot (end-of-season for
    the archive), so its status/duty fields are only accurate for whichever
    moment the snapshot was taken - applying them uniformly across every
    backtested gameweek would inject a wrong, constant signal for any
    player whose injury/duty status actually changed during the season.
    Only turn this on where the roster bootstrap is a snapshot genuinely
    current for reference_date.
    """
    context = _build_prediction_context(
        reference_date, half_life_days, season, bootstrap_file, fixtures_file, shrinkage_games, apply_live_signals,
        roster_bootstrap_file, roster_fixtures_file, current_season, smoothing_alpha, xg_weight, congestion_weight,
        bonus_fixture_sensitivity,
    )
    # fixture_count is an internal column _predict_for_event adds for callers
    # that compare single gameweeks (chip timing - see predict_by_event).
    # Dropped here so this function's long-standing response shape, which the
    # frontend's generated types are pinned to, doesn't quietly grow a field.
    return _predict_for_event(context, next_event).drop(columns=["fixture_count"])


@lru_cache(maxsize=32)
def _build_prediction_context(reference_date, half_life_days, season, bootstrap_file, fixtures_file,
                               shrinkage_games, apply_live_signals,
                               roster_bootstrap_file=None, roster_fixtures_file=None, current_season="2026_27",
                               smoothing_alpha=SHARE_SMOOTHING_ALPHA, xg_weight=TEAM_XG_WEIGHT,
                               congestion_weight=CONGESTION_APPEARANCE_WEIGHT,
                               bonus_fixture_sensitivity=BONUS_FIXTURE_SENSITIVITY):
    """
    Everything predict_player_points() needs that depends only on
    reference_date (not on which gameweek is being predicted) - team
    strengths, involvement shares, appearance probabilities, personal
    history rates, live signals, and the players dataframe. Building
    this once and reusing it across every gameweek in a window is what
    predict_multi_gw_points() does below; predict_player_points() builds
    one fresh per call for a single gameweek, exactly as before this was
    split out.

    Cached: this is the expensive part (recency-weighted team strengths,
    involvement shares, appearance probabilities, and personal history
    rates, each scanning the full gw_history archive) and nearly every
    caller across the app hits it with the exact same default arguments
    (the demo reference_date, live vs archived bootstrap/fixtures) - so
    without caching, every single page load recomputed all of it from
    scratch. Safe to cache: every downstream reader (_predict_for_event)
    treats the returned dict/DataFrame as read-only, building fresh
    objects rather than mutating anything in it when live signals need
    to adjust a player's numbers - see the "Fresh dicts, not in-place
    mutation" comment below.

    See predict_player_points' docstring for roster_bootstrap_file/
    roster_fixtures_file/current_season - when roster_bootstrap_file is
    set, training blends the archived `season` with current_season's own
    gw_history (once it has any before reference_date), both remapped
    into the roster's id-space first - see _remap_team_strengths_to_roster
    and map_player_stats_to_roster for why neither team nor player id is
    stable across a season boundary on its own.
    """
    bootstrap = load_bootstrap(bootstrap_file)
    fixtures = load_fixtures(fixtures_file)
    roster_bootstrap = load_bootstrap(roster_bootstrap_file) if roster_bootstrap_file else bootstrap
    roster_fixtures = load_fixtures(roster_fixtures_file) if roster_fixtures_file else fixtures
    fixtures_by_team_event = build_fixtures_by_team_event(roster_fixtures)

    if roster_bootstrap_file:
        # Live-roster mode: blend archived `season` (remapped by name/code
        # into the roster's id-space) with current_season's own gw_history,
        # once it has any - see compute_team_goal_strengths_blended's
        # docstring. Weight is 0 (pure archive, unchanged) until
        # current_season has a finished gameweek before reference_date.
        team_strengths, league_avgs = compute_team_goal_strengths_blended(
            reference_date, half_life_days, season, current_season, shrinkage_games=shrinkage_games,
            xg_weight=xg_weight, archive_bootstrap=bootstrap, roster_bootstrap=roster_bootstrap,
        )
        involvement = compute_player_involvement_shares_blended(
            reference_date, half_life_days, season, current_season, shrinkage_games=shrinkage_games,
            smoothing_alpha=smoothing_alpha,
            archive_elements=bootstrap["elements"], roster_elements=roster_bootstrap["elements"],
        )
        appearance_probs = compute_appearance_probabilities_blended(
            reference_date, half_life_days, season, current_season, shrinkage_games=shrinkage_games,
            archive_elements=bootstrap["elements"], roster_elements=roster_bootstrap["elements"],
        )
        history_rates = compute_personal_history_rates_blended(
            reference_date, half_life_days, season, current_season, shrinkage_games=shrinkage_games,
            archive_elements=bootstrap["elements"], roster_elements=roster_bootstrap["elements"],
        )
    else:
        # Archived-only mode (eval tools / player_scores): season is fully
        # finished, so there's no "current season" to blend in and no remap
        # needed - unchanged from before blending existed.
        team_strengths, league_avgs = compute_team_goal_strengths(
            reference_date, half_life_days, season, shrinkage_games, xg_weight)
        involvement = compute_player_involvement_shares(reference_date, half_life_days, season, smoothing_alpha)
        appearance_probs = compute_appearance_probabilities(reference_date, half_life_days, season)
        history_rates = compute_personal_history_rates(reference_date, half_life_days, season)

    live_availability = compute_live_availability(roster_bootstrap) if apply_live_signals else {}

    teams_df = pd.DataFrame(roster_bootstrap["teams"])
    positions = pd.DataFrame(roster_bootstrap["element_types"])[["id", "singular_name_short"]]
    team_short_lookup = teams_df.set_index("id")["short_name"].to_dict()

    # Forward-looking fixture pileup (scheduled kickoffs, not results - safe
    # for a walk-forward backtest) over the next CONGESTION_WINDOW_DAYS from
    # reference_date, one figure per team reused across every gameweek this
    # context predicts (see congestion_weight's docstring in fpl.model.rules).
    congestion_by_team = (
        compute_congestion(roster_fixtures, teams_df["id"].tolist(), reference_date, CONGESTION_WINDOW_DAYS)
        if congestion_weight else {}
    )

    df = pd.DataFrame(roster_bootstrap["elements"])[[
        "id", "web_name", "team", "element_type",
        "penalties_order", "direct_freekicks_order", "corners_and_indirect_freekicks_order",
    ]].copy()
    for col in ["penalties_order", "direct_freekicks_order", "corners_and_indirect_freekicks_order"]:
        df[col] = df[col].fillna(0).astype(int)
    df = df.merge(teams_df[["id", "short_name"]], left_on="team", right_on="id", suffixes=("", "_team"))
    df = df.merge(positions, left_on="element_type", right_on="id", suffixes=("", "_pos"))
    df = df.rename(columns={"short_name": "team_short", "singular_name_short": "position"})

    return {
        "df": df,
        "fixtures_by_team_event": fixtures_by_team_event,
        "team_strengths": team_strengths,
        "league_avgs": league_avgs,
        "involvement": involvement,
        "appearance_probs": appearance_probs,
        "history_rates": history_rates,
        "live_availability": live_availability,
        "team_short_lookup": team_short_lookup,
        "apply_live_signals": apply_live_signals,
        "congestion_by_team": congestion_by_team,
        "congestion_weight": congestion_weight,
        "bonus_fixture_sensitivity": bonus_fixture_sensitivity,
    }


def _predict_for_event(context, next_event):
    """The per-gameweek prediction loop, given a context from _build_prediction_context()."""
    df = context["df"]
    fixtures_by_team_event = context["fixtures_by_team_event"]
    team_strengths = context["team_strengths"]
    league_avgs = context["league_avgs"]
    involvement = context["involvement"]
    appearance_probs = context["appearance_probs"]
    history_rates = context["history_rates"]
    live_availability = context["live_availability"]
    team_short_lookup = context["team_short_lookup"]
    apply_live_signals = context["apply_live_signals"]

    default_involvement = {"goal_share": 0.0, "assist_share": 0.0}
    default_appearance = {"p_any": 0.0, "p_60_plus": 0.0}
    default_history = {stat: 0.0 for stat in HISTORY_STAT_COLUMNS}

    rows = []
    for _, player in df.iterrows():
        fx_list = fixtures_by_team_event[player["team"]].get(next_event, [])
        base_row = {
            "id": player["id"], "web_name": player["web_name"],
            "team_short": player["team_short"], "position": player["position"],
        }
        if not fx_list:
            rows.append({
                **base_row, "next_opponent": "BLANK", "fixture_count": 0,
                "haul_probability": 0.0, "ceiling": 0,
                **{k: 0.0 for k in _BREAKDOWN_KEYS},
            })
            continue

        share = involvement.get(player["id"], default_involvement)
        appearance = appearance_probs.get(player["id"], default_appearance)
        rates = history_rates.get(player["id"], default_history)

        # Forward fixture-pileup dampening - unlike apply_live_signals below,
        # this only depends on scheduled kickoff dates (known in advance),
        # so it's safe to apply unconditionally, including inside a backtest.
        congestion_weight = context["congestion_weight"]
        if congestion_weight:
            games_over = context["congestion_by_team"].get(player["team"], 0)
            if games_over > 0:
                factor = max(0.3, 1 - congestion_weight * games_over)
                appearance = {"p_any": appearance["p_any"] * factor, "p_60_plus": appearance["p_60_plus"] * factor}

        if apply_live_signals:
            # Fresh dicts, not in-place mutation - share/appearance may be the
            # shared default_* object above, reused across every player with
            # no history; mutating it in place would corrupt it for all of them.
            factor = live_availability.get(player["id"], 1.0)
            appearance = {"p_any": appearance["p_any"] * factor, "p_60_plus": appearance["p_60_plus"] * factor}

            share = dict(share)
            if player["penalties_order"] == 1:
                share["goal_share"] = min(1.0, share["goal_share"] + PENALTY_TAKER_GOAL_SHARE_BOOST)
            if player["direct_freekicks_order"] == 1:
                share["goal_share"] = min(1.0, share["goal_share"] + FREEKICK_TAKER_GOAL_SHARE_BOOST)
            if player["corners_and_indirect_freekicks_order"] == 1:
                share["assist_share"] = min(1.0, share["assist_share"] + CORNER_TAKER_ASSIST_SHARE_BOOST)

        totals = {k: 0.0 for k in _BREAKDOWN_KEYS}
        combined_distribution = {}
        opponent_labels = []
        for fx in fx_list:
            if fx["is_home"]:
                team_xg, opp_xg = predict_fixture_xg(player["team"], fx["opponent"], team_strengths, league_avgs)
            else:
                opp_xg, team_xg = predict_fixture_xg(fx["opponent"], player["team"], team_strengths, league_avgs)

            fixture_result = _fixture_points(
                player["position"], team_xg, opp_xg, share, appearance, rates,
                context["bonus_fixture_sensitivity"],
            )
            for key in _BREAKDOWN_KEYS:
                totals[key] += fixture_result[key]
            combined_distribution = convolve(combined_distribution, fixture_result["outcome_distribution"])
            opponent_labels.append(f"{team_short_lookup[fx['opponent']]}({'H' if fx['is_home'] else 'A'})")

        # clean_sheet_prob is an average across fixtures, not a sum.
        totals["clean_sheet_prob"] /= len(fx_list)
        totals = {k: round(v, 3) for k, v in totals.items()}

        # The real number of fixtures, not whether there is at least one.
        # Callers scanning a single gameweek (chip timing) need to tell a
        # double gameweek from a single one, and "next_opponent != BLANK"
        # cannot: a DGW and a normal week both come back as one non-blank
        # string. The multi-gameweek wrapper below computes its own
        # window-level fixture_count and overwrites this, so its meaning
        # there ("gameweeks with a fixture") is unchanged.
        shape = summarise(combined_distribution)
        rows.append({
            **base_row, "next_opponent": " & ".join(opponent_labels),
            "fixture_count": len(fx_list),
            "haul_probability": shape["haul_probability"],
            "ceiling": shape["ceiling"],
            **totals,
        })

    return pd.DataFrame(rows)


def predict_by_event(reference_date, next_events, half_life_days=21, season="2025_26",
                     bootstrap_file="bootstrap_static_2025_26_final.json",
                     fixtures_file="fixtures_2025_26_final.json",
                     shrinkage_games=SHRINKAGE_GAMES, apply_live_signals=False,
                     roster_bootstrap_file=None, roster_fixtures_file=None,
                     current_season="2026_27", smoothing_alpha=SHARE_SMOOTHING_ALPHA,
                     xg_weight=TEAM_XG_WEIGHT, congestion_weight=CONGESTION_APPEARANCE_WEIGHT,
                     bonus_fixture_sensitivity=BONUS_FIXTURE_SENSITIVITY):
    """
    One DataFrame per gameweek, keyed by event - the per-gameweek frames
    predict_multi_gw_breakdown() sums, handed back unsummed.

    For callers that need to compare gameweeks against each other rather than
    add them up. Chip timing is the case: it asks "which single gameweek is
    the best one to triple-captain in", which a window total cannot answer.

    The point of having this is that the whole set shares ONE prediction
    context. Scanning a window by calling predict_multi_gw_breakdown() once
    per gameweek with that gameweek's own deadline as reference_date rebuilds
    the context every time - the recency-weighted team strengths, involvement
    shares, appearance probabilities and history rates, each a full scan of
    the gw_history archive - and that dominated everything else: a 15-gameweek
    chip scan took 43 seconds, essentially all of it 15 context builds.

    Using a single reference_date for the window is also the more honest
    model. Every scanned gameweek is in the future, so no extra match data
    exists at GW16's deadline that we don't already have today; passing each
    future deadline as reference_date didn't add information, it just decayed
    the same history a bit further and charged a full rebuild for it.
    """
    frames = _predict_by_event_cached(
        reference_date, tuple(next_events), half_life_days, season, bootstrap_file, fixtures_file,
        shrinkage_games, apply_live_signals, roster_bootstrap_file, roster_fixtures_file, current_season,
        smoothing_alpha, xg_weight, congestion_weight, bonus_fixture_sensitivity,
    )
    return {event: frame.copy() for event, frame in frames.items()}


@lru_cache(maxsize=8)
def _predict_by_event_cached(reference_date, next_events, half_life_days, season, bootstrap_file,
                             fixtures_file, shrinkage_games, apply_live_signals,
                             roster_bootstrap_file, roster_fixtures_file, current_season="2026_27",
                             smoothing_alpha=SHARE_SMOOTHING_ALPHA, xg_weight=TEAM_XG_WEIGHT,
                             congestion_weight=CONGESTION_APPEARANCE_WEIGHT,
                             bonus_fixture_sensitivity=BONUS_FIXTURE_SENSITIVITY):
    """Cached for the same reason _predict_multi_gw_breakdown_cached is: the
    per-gameweek Poisson loop is O(players x gameweeks) and a chip scan runs
    it over the whole window. Callers get copies (see above); this keeps the
    originals. maxsize is smaller because each entry holds a whole window's
    worth of frames rather than one."""
    context = _build_prediction_context(
        reference_date, half_life_days, season, bootstrap_file, fixtures_file, shrinkage_games,
        apply_live_signals, roster_bootstrap_file, roster_fixtures_file, current_season,
        smoothing_alpha, xg_weight, congestion_weight, bonus_fixture_sensitivity,
    )
    return {event: _predict_for_event(context, event) for event in next_events}


def predict_multi_gw_breakdown(reference_date, next_events, half_life_days=21, season="2025_26",
                                bootstrap_file="bootstrap_static_2025_26_final.json",
                                fixtures_file="fixtures_2025_26_final.json",
                                shrinkage_games=SHRINKAGE_GAMES, apply_live_signals=False,
                                roster_bootstrap_file=None, roster_fixtures_file=None,
                                current_season="2026_27", smoothing_alpha=SHARE_SMOOTHING_ALPHA,
                                xg_weight=TEAM_XG_WEIGHT, congestion_weight=CONGESTION_APPEARANCE_WEIGHT,
                                bonus_fixture_sensitivity=BONUS_FIXTURE_SENSITIVITY):
    """
    Returns a DataFrame, one row per player, with every _BREAKDOWN_KEYS
    category (goal_points, assist_points, clean_sheet_points, bonus_points,
    etc. - not just predicted_points) summed across next_events - all
    conditioned on data strictly before reference_date (the start of the
    window), not re-predicting week to week with hindsight. predict_multi_gw_points()
    below is a thin wrapper around this that keeps only the headline total;
    this fuller version exists for callers that want to show what a
    prediction is made of (e.g. the player-detail page), not just the sum.
    See predict_player_points' docstring for why bootstrap_file/fixtures_file/
    season must stay in sync, and for roster_bootstrap_file/roster_fixtures_file/
    current_season.

    Thin, cache-friendly wrapper around _predict_multi_gw_breakdown_cached:
    next_events comes in as a list (needed elsewhere as range(...)), but
    lru_cache needs hashable arguments, so it's converted to a tuple here
    before the cached call.
    """
    result = _predict_multi_gw_breakdown_cached(
        reference_date, tuple(next_events), half_life_days, season, bootstrap_file, fixtures_file,
        shrinkage_games, apply_live_signals, roster_bootstrap_file, roster_fixtures_file, current_season,
        smoothing_alpha, xg_weight, congestion_weight, bonus_fixture_sensitivity,
    )
    return result.copy()


@lru_cache(maxsize=32)
def _predict_multi_gw_breakdown_cached(reference_date, next_events, half_life_days, season, bootstrap_file,
                                        fixtures_file, shrinkage_games, apply_live_signals,
                                        roster_bootstrap_file, roster_fixtures_file, current_season="2026_27",
                                        smoothing_alpha=SHARE_SMOOTHING_ALPHA, xg_weight=TEAM_XG_WEIGHT,
                                        congestion_weight=CONGESTION_APPEARANCE_WEIGHT,
                                        bonus_fixture_sensitivity=BONUS_FIXTURE_SENSITIVITY):
    """
    The actual per-player, per-gameweek prediction loop, cached - almost
    every caller across the app (players list, player detail, squad
    builder, optimizer, alternatives) hits this with the same default
    reference_date/window, and even with _build_prediction_context's setup
    already cached, re-running the O(players x gameweeks) Poisson loop
    from scratch on every request was still the dominant cost (measured:
    ~450ms per /api/players call after caching the context alone, vs
    single-digit ms once this loop's own result is cached too). Returns
    the same DataFrame object across calls - predict_multi_gw_breakdown()
    above copies it before handing it to a caller, since every reader in
    this codebase only merges/filters (which already return new frames)
    rather than mutating in place, but a defensive copy at this one
    boundary is cheap insurance against that changing later.
    """
    context = _build_prediction_context(
        reference_date, half_life_days, season, bootstrap_file, fixtures_file, shrinkage_games, apply_live_signals,
        roster_bootstrap_file, roster_fixtures_file, current_season, smoothing_alpha, xg_weight, congestion_weight,
        bonus_fixture_sensitivity,
    )
    per_gw = {event: _predict_for_event(context, event).set_index("id") for event in next_events}

    first_event = next_events[0]
    result = per_gw[first_event][["web_name", "team_short", "position"]].copy()
    for key in _BREAKDOWN_KEYS:
        result[key] = sum(df[key] for df in per_gw.values())
    # clean_sheet_prob is an average across fixtures/gameweeks, not a sum.
    result["clean_sheet_prob"] = result["clean_sheet_prob"] / len(next_events)
    result["fixture_count"] = sum((df["next_opponent"] != "BLANK").astype(int) for df in per_gw.values())

    ticker = per_gw[first_event]["next_opponent"]
    for event in next_events[1:]:
        ticker = ticker.str.cat(per_gw[event]["next_opponent"], sep=" | ")
    result["fixture_ticker"] = ticker

    for key in _BREAKDOWN_KEYS:
        result[key] = result[key].round(3)
    return result.reset_index()


def predict_multi_gw_points(reference_date, next_events, half_life_days=21, season="2025_26",
                             bootstrap_file="bootstrap_static_2025_26_final.json",
                             fixtures_file="fixtures_2025_26_final.json",
                             shrinkage_games=SHRINKAGE_GAMES, apply_live_signals=False,
                             roster_bootstrap_file=None, roster_fixtures_file=None,
                             current_season="2026_27", smoothing_alpha=SHARE_SMOOTHING_ALPHA,
                             xg_weight=TEAM_XG_WEIGHT, congestion_weight=CONGESTION_APPEARANCE_WEIGHT,
                             bonus_fixture_sensitivity=BONUS_FIXTURE_SENSITIVITY):
    """
    predict_multi_gw_breakdown(), collapsed to just predicted_points (plus
    fixture_count/fixture_ticker) - the headline metric for the app, not
    single-gameweek predict_player_points(): multi_gw_backtest found
    single-gameweek predictions explain ~30% of variance (r^2=0.30) while
    a 5-gameweek window explains ~49% (r^2=0.49) - most of the single-
    gameweek "miss" is real football variance (bonus points, one-off
    explosive performances) rather than a modeling gap, and summing over
    several weeks cancels that noise out. See README.
    """
    breakdown = predict_multi_gw_breakdown(
        reference_date, next_events, half_life_days, season, bootstrap_file, fixtures_file,
        shrinkage_games, apply_live_signals, roster_bootstrap_file, roster_fixtures_file, current_season,
        smoothing_alpha, xg_weight, congestion_weight, bonus_fixture_sensitivity,
    )
    return breakdown[[
        "id", "web_name", "team_short", "position", "predicted_points", "fixture_count", "fixture_ticker",
    ]]
