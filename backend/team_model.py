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

DEFAULT_TEAM_STRENGTH = {"attack_home": 1.0, "attack_away": 1.0, "defence_home": 1.0, "defence_away": 1.0}

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


def compute_team_goal_strengths(reference_date, half_life_days=21, season="2025_26"):
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
    matches = past.drop_duplicates(subset=["fixture", "team_id"]).copy()
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
        home_attack = weighted_mean(team_home, "goals_for")
        away_attack = weighted_mean(team_away, "goals_for")
        home_defence = weighted_mean(team_home, "goals_against")
        away_defence = weighted_mean(team_away, "goals_against")
        strengths[team_id] = {
            "attack_home": home_attack / avg_home_goals if home_attack is not None else 1.0,
            "attack_away": away_attack / avg_away_goals if away_attack is not None else 1.0,
            # Conceded-at-home is compared against the away-scoring average (what
            # a typical away side would put past them), and vice versa.
            "defence_home": home_defence / avg_away_goals if home_defence is not None else 1.0,
            "defence_away": away_defence / avg_home_goals if away_defence is not None else 1.0,
        }

    return strengths, {"avg_home_goals": avg_home_goals, "avg_away_goals": avg_away_goals}


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


def compute_player_involvement_shares(reference_date, half_life_days=21, season="2025_26"):
    """
    element -> {goal_share, assist_share}: this player's recency-weighted
    share of their own team's total goals/assists. Used to split a
    predicted team goal tally down to individual players.
    """
    history = load_gw_history(season)
    past = history[history["kickoff_time"] < reference_date].copy()
    if past.empty:
        return {}

    past["weight"] = recency_weights(past["kickoff_time"], reference_date, half_life_days)
    past["weighted_goals"] = past["weight"] * past["goals_scored"]
    past["weighted_assists"] = past["weight"] * past["assists"]

    team_goals = past.groupby("team_id")["weighted_goals"].sum()
    team_assists = past.groupby("team_id")["weighted_assists"].sum()
    player_goals = past.groupby("element")["weighted_goals"].sum()
    player_assists = past.groupby("element")["weighted_assists"].sum()
    player_team = past.groupby("element")["team_id"].last()

    shares = {}
    for element, team_id in player_team.items():
        team_goal_total = team_goals.get(team_id, 0)
        team_assist_total = team_assists.get(team_id, 0)
        shares[element] = {
            "goal_share": player_goals.get(element, 0) / team_goal_total if team_goal_total else 0.0,
            "assist_share": player_assists.get(element, 0) / team_assist_total if team_assist_total else 0.0,
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


def predict_player_points(reference_date, next_event, half_life_days=21, season="2025_26"):
    """
    Returns a DataFrame, one row per player, with predicted_points for
    their next fixture(s) and every category it's built from (see
    _fixture_points) - covering the full FPL 2025/26 scoring system.
    """
    bootstrap = load_bootstrap()
    fixtures = load_fixtures()
    fixtures_by_team_event = build_fixtures_by_team_event(fixtures)

    team_strengths, league_avgs = compute_team_goal_strengths(reference_date, half_life_days, season)
    involvement = compute_player_involvement_shares(reference_date, half_life_days, season)
    appearance_probs = compute_appearance_probabilities(reference_date, half_life_days, season)
    history_rates = compute_personal_history_rates(reference_date, half_life_days, season)

    default_involvement = {"goal_share": 0.0, "assist_share": 0.0}
    default_appearance = {"p_any": 0.0, "p_60_plus": 0.0}
    default_history = {stat: 0.0 for stat in HISTORY_STAT_COLUMNS}

    teams_df = pd.DataFrame(bootstrap["teams"])
    positions = pd.DataFrame(bootstrap["element_types"])[["id", "singular_name_short"]]
    team_short_lookup = teams_df.set_index("id")["short_name"].to_dict()

    df = pd.DataFrame(bootstrap["elements"])[["id", "web_name", "team", "element_type"]].copy()
    df = df.merge(teams_df[["id", "short_name"]], left_on="team", right_on="id", suffixes=("", "_team"))
    df = df.merge(positions, left_on="element_type", right_on="id", suffixes=("", "_pos"))
    df = df.rename(columns={"short_name": "team_short", "singular_name_short": "position"})

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
