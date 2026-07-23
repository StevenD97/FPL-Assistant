"""
Team-level scoreline prediction (Dixon-Coles-style attack/defence
strength ratios) and a player-level predicted_points decomposition built
on top of it, using gw_history_2025_26.csv for the underlying goals/
assists history.

This is deliberately a second, independent estimate - see analysis.py's
compute_player_scores() for the existing recommendation_score, which
this doesn't touch or replace. Comparing the two is the point.

v1 scope: goals, assists, clean sheets, appearance minutes. Excludes
bonus points, defensive contribution points, saves, and cards - see
recommendation_score for some of those.

Run with: venv\\Scripts\\python.exe team_model.py
"""

import math
import sys
from datetime import datetime

import pandas as pd

from analysis import build_fixtures_by_team_event, load_bootstrap, load_fixtures, load_gw_history

# FPL's scoring rules for goals/assists/clean sheets (2025/26 ruleset).
GOAL_POINTS = {"GKP": 6, "DEF": 6, "MID": 5, "FWD": 4}
ASSIST_POINTS = 3
CLEAN_SHEET_POINTS = {"GKP": 4, "DEF": 4, "MID": 1, "FWD": 0}
APPEARANCE_POINTS_60_PLUS = 2

DEFAULT_TEAM_STRENGTH = {"attack_home": 1.0, "attack_away": 1.0, "defence_home": 1.0, "defence_away": 1.0}


def _recency_weights(kickoff_times, reference_date, half_life_days):
    days_ago = (reference_date - kickoff_times).dt.total_seconds() / 86400
    return 0.5 ** (days_ago / half_life_days)


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
    matches["weight"] = _recency_weights(matches["kickoff_time"], reference_date, half_life_days)

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
    """Poisson P(goals against = 0) = e^-lambda - no scipy needed for a single term."""
    return math.exp(-expected_goals_against)


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

    past["weight"] = _recency_weights(past["kickoff_time"], reference_date, half_life_days)
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


def predict_player_points(reference_date, next_event, half_life_days=21, season="2025_26"):
    """
    Returns a DataFrame, one row per player, with predicted_points for
    their next fixture(s): predicted goals/assists (the fixture's
    predicted team xG, split by the player's involvement share) plus
    clean-sheet probability (from the opponent's predicted xG, via
    Poisson) and an appearance-points estimate.
    """
    bootstrap = load_bootstrap()
    fixtures = load_fixtures()
    fixtures_by_team_event = build_fixtures_by_team_event(fixtures)

    team_strengths, league_avgs = compute_team_goal_strengths(reference_date, half_life_days, season)
    involvement = compute_player_involvement_shares(reference_date, half_life_days, season)

    teams_df = pd.DataFrame(bootstrap["teams"])
    positions = pd.DataFrame(bootstrap["element_types"])[["id", "singular_name_short"]]
    team_short_lookup = teams_df.set_index("id")["short_name"].to_dict()

    df = pd.DataFrame(bootstrap["elements"])[["id", "web_name", "team", "element_type", "starts_per_90"]].copy()
    df = df.merge(teams_df[["id", "short_name"]], left_on="team", right_on="id", suffixes=("", "_team"))
    df = df.merge(positions, left_on="element_type", right_on="id", suffixes=("", "_pos"))
    df = df.rename(columns={"short_name": "team_short", "singular_name_short": "position"})
    df["starts_per_90"] = pd.to_numeric(df["starts_per_90"], errors="coerce").fillna(0).clip(upper=1)

    rows = []
    for _, player in df.iterrows():
        fx_list = fixtures_by_team_event[player["team"]].get(next_event, [])
        if not fx_list:
            rows.append({
                "id": player["id"], "web_name": player["web_name"], "team_short": player["team_short"],
                "position": player["position"], "next_opponent": "BLANK", "predicted_points": 0.0,
                "predicted_goals": 0.0, "predicted_assists": 0.0, "clean_sheet_prob": 0.0,
            })
            continue

        share = involvement.get(player["id"], {"goal_share": 0.0, "assist_share": 0.0})
        start_prob = player["starts_per_90"]

        total_points, total_goals, total_assists, total_cs_prob = 0.0, 0.0, 0.0, 0.0
        opponent_labels = []
        for fx in fx_list:
            if fx["is_home"]:
                team_xg, opp_xg = predict_fixture_xg(player["team"], fx["opponent"], team_strengths, league_avgs)
            else:
                opp_xg, team_xg = predict_fixture_xg(fx["opponent"], player["team"], team_strengths, league_avgs)

            predicted_goals = team_xg * share["goal_share"]
            predicted_assists = team_xg * share["assist_share"]
            cs_prob = clean_sheet_probability(opp_xg)

            fixture_points = (
                predicted_goals * GOAL_POINTS.get(player["position"], 4)
                + predicted_assists * ASSIST_POINTS
                + cs_prob * CLEAN_SHEET_POINTS.get(player["position"], 0) * start_prob
                + start_prob * APPEARANCE_POINTS_60_PLUS
            )

            total_points += fixture_points
            total_goals += predicted_goals
            total_assists += predicted_assists
            total_cs_prob += cs_prob
            opponent_labels.append(f"{team_short_lookup[fx['opponent']]}({'H' if fx['is_home'] else 'A'})")

        rows.append({
            "id": player["id"], "web_name": player["web_name"], "team_short": player["team_short"],
            "position": player["position"], "next_opponent": " & ".join(opponent_labels),
            "predicted_points": round(total_points, 2),
            "predicted_goals": round(total_goals, 3),
            "predicted_assists": round(total_assists, 3),
            "clean_sheet_prob": round(total_cs_prob / len(fx_list), 3),
        })

    return pd.DataFrame(rows)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", 200)

    REFERENCE_DATE = datetime(2025, 11, 30)  # demo date; see scoring.py's note on this
    NEXT_EVENT = 10

    scores = predict_player_points(REFERENCE_DATE, NEXT_EVENT)
    ranked = scores.sort_values("predicted_points", ascending=False)
    cols = ["web_name", "team_short", "position", "next_opponent",
            "predicted_points", "predicted_goals", "predicted_assists", "clean_sheet_prob"]

    print("=== Top 20 by predicted points ===")
    print(ranked[cols].head(20).to_string(index=False))

    print("\n=== Top 10 goalkeepers/defenders by predicted points (clean-sheet driven) ===")
    defensive = ranked[ranked["position"].isin(["GKP", "DEF"])]
    print(defensive[cols].head(10).to_string(index=False))
