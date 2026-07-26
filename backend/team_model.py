"""
Team-level scoreline prediction (Dixon-Coles-style attack/defence
strength ratios) and a player-level predicted_points decomposition built
on top of it, using gw_history_2025_26.csv for the underlying goals/
assists/defensive-actions history.

This is deliberately a second, independent estimate - see analysis.py's
compute_player_scores() for the existing recommendation_score, which
this doesn't touch or replace. Comparing the two is the point.

Covers every category in the FPL 2025/26 scoring rules:
  - appearance (1pt <60 mins, 2pt for 60+)
  - goals (by position: GKP 10, DEF 6, MID 5, FWD 4) and assists (3, all
    positions) - split from the fixture's predicted team goals (Stage 1)
    by each player's historical share of their team's goals/assists
  - clean sheets (GKP/DEF 4, MID 1, FWD 0) and goals conceded
    (-1 per 2, GKP/DEF only) - both derived from the opponent's Stage 1
    predicted expected goals via a Poisson model, not personal history,
    since these are fixture-dependent
  - bonus, saves, penalty saves/misses, cards, own goals, and defensive
    contribution (+2 for 10 CBIT as a defender / 12 CBIRT as a
    midfielder or forward) - all modeled as a recency-weighted personal
    rate from gw_history, since (bonus aside) these aren't something
    Stage 1's team-level model has any signal on. Defensive contribution
    specifically needs a threshold crossed in a single match, so it uses
    a Poisson model over the recency-weighted average count rather than
    a flat rate.

Approximations worth knowing about:
  - Bonus points are modeled as a flat recency-weighted average rather
    than simulating the BPS system (which would need every player's
    per-match stats, not just this player's) - a common simplification.
  - Defensive contribution and saves both assume the underlying count is
    Poisson-distributed with the recency-weighted average as its rate,
    which is a reasonable but unverified assumption (no distribution
    shape is available from the average alone).

Run with: venv\\Scripts\\python.exe team_model.py
"""

import math
import sys
from datetime import datetime
from functools import lru_cache

import pandas as pd

from analysis import (
    build_fixtures_by_team_event,
    compute_recency_weighted_stat,
    load_bootstrap,
    load_fixtures,
    load_gw_history,
    recency_weights,
)

# FPL's 2025/26 scoring rules (verified against fantasyfootballscout.co.uk's
# rules writeup - see module docstring).
GOAL_POINTS = {"GKP": 10, "DEF": 6, "MID": 5, "FWD": 4}
ASSIST_POINTS = 3
CLEAN_SHEET_POINTS = {"GKP": 4, "DEF": 4, "MID": 1, "FWD": 0}
GOALS_CONCEDED_PENALTY = -1  # per 2 goals conceded, GKP/DEF only
GOALS_CONCEDED_DIVISOR = 2
APPEARANCE_POINTS_ANY = 1
APPEARANCE_POINTS_60_PLUS = 2  # total for 60+, not additive on top of APPEARANCE_POINTS_ANY
SAVE_POINTS = 1
SAVE_DIVISOR = 3
PENALTY_SAVE_POINTS = 5
PENALTY_MISS_POINTS = -2
YELLOW_CARD_POINTS = -1
RED_CARD_POINTS = -3
OWN_GOAL_POINTS = -2
DEFENSIVE_CONTRIBUTION_THRESHOLD = {"DEF": 10, "MID": 12, "FWD": 12}  # none for GKP
DEFENSIVE_CONTRIBUTION_POINTS = 2

# Flat, hand-calibrated involvement-share boosts for a *current* primary
# set-piece taker - gw_history-derived goal_share/assist_share can't see a
# duty change until goals/assists from it actually accumulate in the
# archive. Same spirit as recommendation_score's SET_PIECE_BONUS constants
# in analysis.py, adapted to team_model's share-based (not points-based)
# scoring. Only applied when apply_live_signals=True - see predict_player_points.
PENALTY_TAKER_GOAL_SHARE_BOOST = 0.08
FREEKICK_TAKER_GOAL_SHARE_BOOST = 0.03
CORNER_TAKER_ASSIST_SHARE_BOOST = 0.04

DEFAULT_TEAM_STRENGTH = {"attack_home": 1.0, "attack_away": 1.0, "defence_home": 1.0, "defence_away": 1.0}

# Promoted teams (no name match anywhere in the training archive - e.g.
# Coventry/Hull/Ipswich coming into 2026/27) get this discounted prior
# instead of DEFAULT_TEAM_STRENGTH's neutral 1.0 - assuming a newly-
# promoted side is exactly league-average overstates them: they spent last
# season beating weaker Championship opposition, and that output doesn't
# translate directly into the Premier League. These are rough, commonly-
# cited Premier League figures (promoted teams have historically
# underperformed a neutral prior by roughly this much in their first
# season back), NOT calibrated against this app's own backtest - there's
# no historical multi-season archive here to validate the exact numbers
# against. Revisit once real 2026/27 results exist for the promoted sides
# (see README's season-transition notes).
PROMOTED_TEAM_ATTACK_DISCOUNT = 0.85  # <1.0 = below-average scoring
PROMOTED_TEAM_DEFENCE_PENALTY = 1.15  # >1.0 = leakier defence
PROMOTED_TEAM_STRENGTH = {
    "attack_home": PROMOTED_TEAM_ATTACK_DISCOUNT,
    "attack_away": PROMOTED_TEAM_ATTACK_DISCOUNT,
    "defence_home": PROMOTED_TEAM_DEFENCE_PENALTY,
    "defence_away": PROMOTED_TEAM_DEFENCE_PENALTY,
}

# How many "pseudo-games" worth of trust in the league average to blend into a
# team's attack/defence ratios - see _shrink_ratio. Higher = more conservative
# (needs more games before trusting a team-specific ratio over the average).
SHRINKAGE_GAMES = 3

# Additive (Dirichlet/Laplace-style) smoothing for compute_player_involvement_shares,
# in units of recency-weighted team xG/xA (added once, toward a position-average
# prior share - see that function's docstring). Solves a problem team-level
# strengths above never had (_shrink_ratio already regularizes those): an
# established, heavily-used player's share of their own team's output had NO
# regularization at all - found via a live-app report that the model had Bruno
# Fernandes on 2.0 predicted goals and 4.2 predicted assists over a 5-gameweek
# window, traced back to a recency-weighted assist_share of 0.505 (half of Man
# Utd's *entire* modeled assist output credited to one player), off a real
# season where he had 24 of the team's 60 actual assists (40%) even before
# recency-weighting toward a strong finish pushed it higher still. No real
# single player sustains that. Higher = more conservative (pulls harder toward
# what's typical for the player's position). Picked via a grid search against
# backtest.py's walk-forward accuracy (see tune_share_alpha.py, a throwaway
# script kept alongside this commit for the record): alpha=0 (xG/xA alone, no
# smoothing) already fixes most of the systematic bias (best MAE, best
# Spearman r, ~zero DEF bias) but has the *worst* top-20 precision of the
# grid; increasing alpha steadily trades a little MAE/Spearman/bias for a
# meaningfully better top-20 precision (0.119 -> 0.135, the metric closest to
# "would this have helped pick a captain/differential" - see backtest.py's
# docstring) up to about alpha=0.5-0.75, where it plateaus and DEF bias keeps
# climbing past that point with no further top-20 benefit. 0.5 is the low
# end of that plateau - the least aggressive smoothing that still captures
# the top-20 gain.
SHARE_SMOOTHING_ALPHA = 0.5

# Minimum recency-weighted appearance evidence (sum of per-fixture weight,
# see recency_weights) for a player to count toward their position's average
# share when building compute_player_involvement_shares' smoothing prior -
# without this, a debutant's single substitute appearance (~0 raw share,
# nothing to show for it yet) would drag the whole position's "typical"
# share down for everyone, including established players. Set well below a
# single full match's weight (~1.0 at zero days ago) so a player only needs
# a handful of appearances, not a long track record, to count.
MIN_APPEARANCE_WEIGHT_FOR_POSITION_PRIOR = 0.5

# half_life_days for predicting a brand-new season from the prior season's
# archive (no gw_history for the new season exists yet to train on) - the
# default half_life_days=21 is tuned for within-season recency (weeks
# apart), and decays a ~90-day close-season gap to near-zero weight,
# collapsing _shrink_ratio's confidence toward every team looking equally
# average (empirically: spread across teams' attack_home ratios drops from
# ~0.52 in-season to ~0.04 at half_life=21 across a 90-day gap). 90 days
# was chosen by matching the resulting cross-season spread/rank-correlation
# back against the in-season, end-of-prior-season baseline (spread ~0.50,
# Spearman ~0.81 - see README for the numbers).
CROSS_SEASON_HALF_LIFE_DAYS = 90

# Personal-history stats pulled via compute_recency_weighted_stat - every
# category that isn't derivable from the Stage 1 team-goals model.
HISTORY_STAT_COLUMNS = [
    "bonus", "saves", "penalties_saved", "penalties_missed",
    "yellow_cards", "red_cards", "own_goals", "defensive_contribution",
]


def _poisson_pmf(k, lam):
    return math.exp(-lam) * lam ** k / math.factorial(k)


def _poisson_prob_at_least(lam, threshold, max_k=60):
    """P(X >= threshold) for X ~ Poisson(lam)."""
    if threshold <= 0:
        return 1.0
    return max(0.0, 1 - sum(_poisson_pmf(k, lam) for k in range(threshold)))


def _poisson_expected_floor_division(lam, divisor, max_k=60):
    """E[floor(X/divisor)] for X ~ Poisson(lam) - used for saves and goals conceded penalties."""
    return sum(_poisson_pmf(k, lam) * (k // divisor) for k in range(max_k + 1))


def compute_team_goal_strengths(reference_date, half_life_days=21, season="2025_26",
                                 shrinkage_games=SHRINKAGE_GAMES):
    """
    team_id -> {attack_home, attack_away, defence_home, defence_away}:
    recency-weighted goals scored/conceded, home/away split, each
    normalized against the league-wide home/away average (so 1.0 is
    league-average, >1 attack is above-average scoring, >1 defence is a
    leaky defence - the standard Dixon-Coles ratio form).

    Also returns the league-wide average home/away goals, needed to turn
    these ratios back into expected goals for a specific fixture.
    """
    history = load_gw_history(season)
    past = history[history["kickoff_time"] < reference_date]
    if past.empty:
        return {}, {"avg_home_goals": 0.0, "avg_away_goals": 0.0}

    # One row per team per fixture - player rows are duplicated per fixture.
    # GW is included alongside fixture (not just team_id) as defense-in-depth:
    # a genuine blank gameweek's row uses fixture=0 as a sentinel (see
    # ingest/pipeline.py), and a team blanking more than once in a season
    # would otherwise collide under fixture=0 alone. Real fixture ids
    # (played matches, archived or live) are already season-unique, so this
    # is a no-op for them.
    matches = past.drop_duplicates(subset=["GW", "fixture", "team_id"]).copy()
    matches["goals_for"] = matches["team_h_score"].where(matches["was_home"], matches["team_a_score"])
    matches["goals_against"] = matches["team_a_score"].where(matches["was_home"], matches["team_h_score"])
    matches["weight"] = recency_weights(matches["kickoff_time"], reference_date, half_life_days)

    home = matches[matches["was_home"]]
    away = matches[~matches["was_home"]]

    def weighted_mean(frame, col):
        if frame.empty or frame["weight"].sum() == 0:
            return None
        return (frame[col] * frame["weight"]).sum() / frame["weight"].sum()

    avg_home_goals = weighted_mean(home, "goals_for") or 1.0
    avg_away_goals = weighted_mean(away, "goals_for") or 1.0

    strengths = {}
    for team_id, team_matches in matches.groupby("team_id"):
        team_home = team_matches[team_matches["was_home"]]
        team_away = team_matches[~team_matches["was_home"]]
        home_weight = team_home["weight"].sum()
        away_weight = team_away["weight"].sum()
        strengths[team_id] = {
            "attack_home": _shrink_ratio(weighted_mean(team_home, "goals_for"), home_weight, avg_home_goals, shrinkage_games),
            "attack_away": _shrink_ratio(weighted_mean(team_away, "goals_for"), away_weight, avg_away_goals, shrinkage_games),
            # Conceded-at-home is compared against the away-scoring average (what
            # a typical away side would put past them), and vice versa.
            "defence_home": _shrink_ratio(weighted_mean(team_home, "goals_against"), home_weight, avg_away_goals, shrinkage_games),
            "defence_away": _shrink_ratio(weighted_mean(team_away, "goals_against"), away_weight, avg_home_goals, shrinkage_games),
        }

    return strengths, {"avg_home_goals": avg_home_goals, "avg_away_goals": avg_away_goals}


def _shrink_ratio(weighted_value, weight_sum, league_avg, shrinkage_games=SHRINKAGE_GAMES):
    """
    Shrinks a raw ratio (weighted_value / league_avg) toward the
    league-average ratio of 1.0, in proportion to how much recency-
    weighted evidence backs it. Without this, a team with only 1-2
    games of history (or a home/away split with barely any recent
    weight) can produce a ratio driven entirely by noise - the backtest
    found a defence_home ratio of 4.16 and a defence_away ratio of
    exactly 0.0 this way, and predict_fixture_xg multiplying two such
    ratios together produced a nonsensical ~8 expected goals for a
    single match (see README). shrinkage_games is how many "pseudo-
    games" worth of prior trust in the league average to blend in -
    weight_sum needs to be that large before the raw ratio gets even
    half its normal say.
    """
    if weighted_value is None or weight_sum == 0:
        return 1.0
    raw_ratio = weighted_value / league_avg
    shrinkage = weight_sum / (weight_sum + shrinkage_games)
    return shrinkage * raw_ratio + (1 - shrinkage) * 1.0


def _current_season_gws_played(reference_date, season):
    """
    How many of `season`'s gameweeks have kickoff data strictly before
    reference_date - the evidence signal _blend_weight below shrinks on.
    0 before that season has any results yet - true for 2026/27 as of this
    writing, where there's no DB data *and* no gw_history_2026_27.csv file
    on disk at all yet (not just an empty table/file - see load_gw_history/
    db.read.gw_history_from_db), so this deliberately treats "no data
    source exists for this season yet" the same as "0 games played" rather
    than letting a FileNotFoundError propagate.
    """
    try:
        history = load_gw_history(season)
    except (FileNotFoundError, RuntimeError):
        return 0
    past = history[history["kickoff_time"] < reference_date]
    return int(past["GW"].nunique()) if not past.empty else 0


def _blend_weight(n_current_gws, shrinkage_games=SHRINKAGE_GAMES):
    """
    0 current-season gameweeks played -> 0 (pure archive - identical to
    today's pre-season behaviour). Grows toward 1 as the current season
    accumulates games, using the same "pseudo-games of trust" shrinkage
    shape as _shrink_ratio, so the model is internally consistent about
    how fast it starts trusting new evidence over old.
    """
    if n_current_gws <= 0:
        return 0.0
    return n_current_gws / (n_current_gws + shrinkage_games)


def _blend_dicts(archive_dict, current_dict, weight, keys, default):
    """Per-key weighted average of two {id: {key: value}} dicts (same id-space in both - callers remap the
    archive side to the roster/current id-space first, same as every other cross-season merge in this file)."""
    blended = {}
    for entity_id in set(archive_dict) | set(current_dict):
        a = archive_dict.get(entity_id, default)
        c = current_dict.get(entity_id, default)
        blended[entity_id] = {k: weight * c[k] + (1 - weight) * a[k] for k in keys}
    return blended


def compute_team_goal_strengths_blended(reference_date, half_life_days=21,
                                         archive_season="2025_26", current_season="2026_27",
                                         archive_half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
                                         shrinkage_games=SHRINKAGE_GAMES,
                                         archive_bootstrap=None, roster_bootstrap=None):
    """
    Team strengths blended across the archived and current seasons, ending
    up in the *roster* (current-season) team-id space either way - the
    season-transition sequel to compute_team_goal_strengths, for once the
    current season actually has results to train on.

    Before current_season has any finished gameweeks strictly before
    reference_date, this is mathematically identical to today's archive-
    only + by-name roster remap (_remap_team_strengths_to_roster) - the
    blend weight is exactly 0 (see _blend_weight), so this is a strict
    superset of existing behaviour, not a change to it, for every request
    made before 2026/27 GW1 is actually played. As current-season
    gameweeks accumulate, weight shifts toward that season's own (fresher,
    but noisier) team strengths.

    archive_bootstrap/roster_bootstrap, if given, must be the full
    bootstrap dicts for their respective seasons (only ["teams"] is used) -
    required to remap the archive side into the roster's team-id space
    before blending (FPL reassigns team ids every season). Omit both to
    blend two already-same-id-space seasons directly (no remap needed).
    """
    archive_strengths, archive_avgs = compute_team_goal_strengths(
        reference_date, archive_half_life_days, archive_season, shrinkage_games)
    if archive_bootstrap is not None and roster_bootstrap is not None:
        archive_strengths = _remap_team_strengths_to_roster(
            archive_strengths, archive_bootstrap["teams"], roster_bootstrap["teams"])

    weight = _blend_weight(_current_season_gws_played(reference_date, current_season), shrinkage_games)
    if weight == 0.0:
        return archive_strengths, archive_avgs

    current_strengths, current_avgs = compute_team_goal_strengths(
        reference_date, half_life_days, current_season, shrinkage_games)
    blended_strengths = _blend_dicts(
        archive_strengths, current_strengths, weight,
        ["attack_home", "attack_away", "defence_home", "defence_away"], DEFAULT_TEAM_STRENGTH,
    )
    blended_avgs = {
        "avg_home_goals": weight * current_avgs["avg_home_goals"] + (1 - weight) * archive_avgs["avg_home_goals"],
        "avg_away_goals": weight * current_avgs["avg_away_goals"] + (1 - weight) * archive_avgs["avg_away_goals"],
    }
    return blended_strengths, blended_avgs


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


def _remap_team_strengths_to_roster(team_strengths, training_teams, roster_teams):
    """
    Remaps team_strengths (keyed by training-season team ids) to the
    roster season's team ids, matching by team name. FPL reassigns team
    ids alphabetically every season (team id 3 was Burnley in 2025/26, is
    Bournemouth in 2026/27) - a bootstrap's own team ids are only ever
    meaningful against fixtures/players from that *same* bootstrap.

    Two different fallback cases, deliberately not conflated:
    - Promoted teams with no name match anywhere in the training archive
      (no top-flight history there at all - e.g. Coventry/Hull/Ipswich
      coming into 2026/27) get PROMOTED_TEAM_STRENGTH - a discounted, not
      neutral, prior (see its own comment for why).
    - A team that *does* match by name but has no recency-weighted games
      logged yet in team_strengths (e.g. very early in a season, before
      any of its fixtures have kicked off) gets DEFAULT_TEAM_STRENGTH's
      neutral 1.0 instead - a genuinely different case, since there's no
      reason to assume that team specifically is below-average.
    """
    name_to_training_id = {team["name"]: team["id"] for team in training_teams}
    remapped = {}
    for team in roster_teams:
        training_id = name_to_training_id.get(team["name"])
        if training_id is None:
            remapped[team["id"]] = PROMOTED_TEAM_STRENGTH
        else:
            remapped[team["id"]] = team_strengths.get(training_id, DEFAULT_TEAM_STRENGTH)
    return remapped


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


def predict_fixture_xg(home_team_id, away_team_id, team_strengths, league_avgs):
    """Expected goals for both sides of a fixture (Dixon-Coles multiplicative form)."""
    home = team_strengths.get(home_team_id, DEFAULT_TEAM_STRENGTH)
    away = team_strengths.get(away_team_id, DEFAULT_TEAM_STRENGTH)
    home_xg = league_avgs["avg_home_goals"] * home["attack_home"] * away["defence_away"]
    away_xg = league_avgs["avg_away_goals"] * away["attack_away"] * home["defence_home"]
    return home_xg, away_xg


def clean_sheet_probability(expected_goals_against):
    """Poisson P(goals against = 0) = e^-lambda."""
    return _poisson_pmf(0, expected_goals_against)


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


def _fixture_points(position, team_xg, opp_xg, share, appearance, history_rates):
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
    bonus_points = history_rates["bonus"] * p_any
    save_points = SAVE_POINTS * (history_rates["saves"] / SAVE_DIVISOR) * p_any if position == "GKP" else 0.0
    penalty_save_points = PENALTY_SAVE_POINTS * history_rates["penalties_saved"] * p_any if position == "GKP" else 0.0
    penalty_miss_points = PENALTY_MISS_POINTS * history_rates["penalties_missed"] * p_any
    card_points = (
        YELLOW_CARD_POINTS * history_rates["yellow_cards"] + RED_CARD_POINTS * history_rates["red_cards"]
    ) * p_any
    own_goal_points = OWN_GOAL_POINTS * history_rates["own_goals"] * p_any

    defensive_contribution_points = 0.0
    threshold = DEFENSIVE_CONTRIBUTION_THRESHOLD.get(position)
    if threshold is not None:
        dc_prob = _poisson_prob_at_least(history_rates["defensive_contribution"], threshold)
        defensive_contribution_points = DEFENSIVE_CONTRIBUTION_POINTS * dc_prob * p_any

    total_points = (
        appearance_points + goal_points + assist_points + clean_sheet_points + goals_conceded_points
        + bonus_points + save_points + penalty_save_points + penalty_miss_points + card_points
        + own_goal_points + defensive_contribution_points
    )

    return {
        "predicted_points": total_points,
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
                           current_season="2026_27", smoothing_alpha=SHARE_SMOOTHING_ALPHA):
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
    behaviour, unchanged - see backtest.py/multi_gw_backtest.py/tune.py,
    which never set this). When set, training also blends in
    current_season's own gw_history once it has any (see
    compute_team_goal_strengths_blended and friends in this file) -
    before current_season has a single finished gameweek before
    reference_date (true for every request made before 2026/27 GW1 is
    actually played), the blend weight is exactly 0 and this is
    identical to the archive-only + by-name/by-code roster remap this
    already did (_remap_team_strengths_to_roster/
    map_player_stats_to_roster) - neither id is stable across a season
    boundary on its own, which is why those remaps exist at all.

    apply_live_signals=True layers two of the roster bootstrap's own
    fields on top of the gw_history-trained numbers above: live
    injury/suspension status (compute_live_availability) scales
    appearance probability, and current primary set-piece duty boosts
    goal_share/assist_share. Defaults to False, and
    backtest.py/multi_gw_backtest.py/tune.py never set it: bootstrap_file
    is a single frozen snapshot (end-of-season for the archive), so its
    status/duty fields are only accurate for whichever moment the
    snapshot was taken - applying them uniformly across every
    backtested gameweek would inject a wrong, constant signal for any
    player whose injury/duty status actually changed during the season.
    Only turn this on where the roster bootstrap is a snapshot genuinely
    current for reference_date.
    """
    context = _build_prediction_context(
        reference_date, half_life_days, season, bootstrap_file, fixtures_file, shrinkage_games, apply_live_signals,
        roster_bootstrap_file, roster_fixtures_file, current_season, smoothing_alpha,
    )
    return _predict_for_event(context, next_event)


@lru_cache(maxsize=32)
def _build_prediction_context(reference_date, half_life_days, season, bootstrap_file, fixtures_file,
                               shrinkage_games, apply_live_signals,
                               roster_bootstrap_file=None, roster_fixtures_file=None, current_season="2026_27",
                               smoothing_alpha=SHARE_SMOOTHING_ALPHA):
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
            archive_bootstrap=bootstrap, roster_bootstrap=roster_bootstrap,
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
        # Archived-only mode (backtest.py/tune.py/scoring.py/player_scores):
        # season is fully finished, so there's no "current season" to blend
        # in and no remap needed - unchanged from before blending existed.
        team_strengths, league_avgs = compute_team_goal_strengths(reference_date, half_life_days, season, shrinkage_games)
        involvement = compute_player_involvement_shares(reference_date, half_life_days, season, smoothing_alpha)
        appearance_probs = compute_appearance_probabilities(reference_date, half_life_days, season)
        history_rates = compute_personal_history_rates(reference_date, half_life_days, season)

    live_availability = compute_live_availability(roster_bootstrap) if apply_live_signals else {}

    teams_df = pd.DataFrame(roster_bootstrap["teams"])
    positions = pd.DataFrame(roster_bootstrap["element_types"])[["id", "singular_name_short"]]
    team_short_lookup = teams_df.set_index("id")["short_name"].to_dict()

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
            rows.append({**base_row, "next_opponent": "BLANK", **{k: 0.0 for k in _BREAKDOWN_KEYS}})
            continue

        share = involvement.get(player["id"], default_involvement)
        appearance = appearance_probs.get(player["id"], default_appearance)
        rates = history_rates.get(player["id"], default_history)

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
        opponent_labels = []
        for fx in fx_list:
            if fx["is_home"]:
                team_xg, opp_xg = predict_fixture_xg(player["team"], fx["opponent"], team_strengths, league_avgs)
            else:
                opp_xg, team_xg = predict_fixture_xg(fx["opponent"], player["team"], team_strengths, league_avgs)

            fixture_result = _fixture_points(player["position"], team_xg, opp_xg, share, appearance, rates)
            for key in _BREAKDOWN_KEYS:
                totals[key] += fixture_result[key]
            opponent_labels.append(f"{team_short_lookup[fx['opponent']]}({'H' if fx['is_home'] else 'A'})")

        # clean_sheet_prob is an average across fixtures, not a sum.
        totals["clean_sheet_prob"] /= len(fx_list)
        totals = {k: round(v, 3) for k, v in totals.items()}

        rows.append({**base_row, "next_opponent": " & ".join(opponent_labels), **totals})

    return pd.DataFrame(rows)


def predict_multi_gw_breakdown(reference_date, next_events, half_life_days=21, season="2025_26",
                                bootstrap_file="bootstrap_static_2025_26_final.json",
                                fixtures_file="fixtures_2025_26_final.json",
                                shrinkage_games=SHRINKAGE_GAMES, apply_live_signals=False,
                                roster_bootstrap_file=None, roster_fixtures_file=None,
                                current_season="2026_27", smoothing_alpha=SHARE_SMOOTHING_ALPHA):
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
        smoothing_alpha,
    )
    return result.copy()


@lru_cache(maxsize=32)
def _predict_multi_gw_breakdown_cached(reference_date, next_events, half_life_days, season, bootstrap_file,
                                        fixtures_file, shrinkage_games, apply_live_signals,
                                        roster_bootstrap_file, roster_fixtures_file, current_season="2026_27",
                                        smoothing_alpha=SHARE_SMOOTHING_ALPHA):
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
        roster_bootstrap_file, roster_fixtures_file, current_season, smoothing_alpha,
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
                             current_season="2026_27", smoothing_alpha=SHARE_SMOOTHING_ALPHA):
    """
    predict_multi_gw_breakdown(), collapsed to just predicted_points (plus
    fixture_count/fixture_ticker) - the headline metric for the app, not
    single-gameweek predict_player_points(): multi_gw_backtest.py found
    single-gameweek predictions explain ~30% of variance (r^2=0.30) while
    a 5-gameweek window explains ~49% (r^2=0.49) - most of the single-
    gameweek "miss" is real football variance (bonus points, one-off
    explosive performances) rather than a modeling gap, and summing over
    several weeks cancels that noise out. See README.
    """
    breakdown = predict_multi_gw_breakdown(
        reference_date, next_events, half_life_days, season, bootstrap_file, fixtures_file,
        shrinkage_games, apply_live_signals, roster_bootstrap_file, roster_fixtures_file, current_season,
        smoothing_alpha,
    )
    return breakdown[[
        "id", "web_name", "team_short", "position", "predicted_points", "fixture_count", "fixture_ticker",
    ]]


def resolve_live_to_training_id(live_id, live_elements, training_elements):
    """
    Single-player version of the code-matching remap this file uses
    throughout for live-roster predictions (see map_player_stats_to_roster) -
    returns the training-season element id for a given live-season element
    id, matched by FPL's stable `code` field (element `id` itself gets
    recompacted every season and is not safe to use directly - see that
    function's docstring). Returns None if the player has no top-flight
    record in the training archive (a new signing, or a promoted club's
    player) - the honest answer, not a guess.
    """
    live_player = next((p for p in live_elements if p["id"] == live_id), None)
    if live_player is None:
        return None
    code_to_training_id = {p["code"]: p["id"] for p in training_elements}
    return code_to_training_id.get(live_player["code"])


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", 250)

    REFERENCE_DATE = datetime(2025, 11, 30)  # demo date; see scoring.py's note on this
    NEXT_EVENT = 10

    scores = predict_player_points(REFERENCE_DATE, NEXT_EVENT)
    ranked = scores.sort_values("predicted_points", ascending=False)
    summary_cols = ["web_name", "team_short", "position", "next_opponent", "predicted_points",
                     "predicted_goals", "predicted_assists", "clean_sheet_prob"]
    breakdown_cols = ["web_name", "position", "predicted_points", "appearance_points", "goal_points",
                       "assist_points", "clean_sheet_points", "goals_conceded_points", "bonus_points",
                       "save_points", "penalty_save_points", "penalty_miss_points", "card_points",
                       "own_goal_points", "defensive_contribution_points"]

    print("=== Top 20 by predicted points ===")
    print(ranked[summary_cols].head(20).to_string(index=False))

    print("\n=== Top 10 goalkeepers/defenders by predicted points (clean-sheet driven) ===")
    defensive = ranked[ranked["position"].isin(["GKP", "DEF"])]
    print(defensive[summary_cols].head(10).to_string(index=False))

    print("\n=== Full points breakdown, top 10 ===")
    print(ranked[breakdown_cols].head(10).to_string(index=False))
