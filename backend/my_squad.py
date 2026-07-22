"""
Phase C: squad-level category scoring for your actual FPL team.

Run with: venv\\Scripts\\python.exe my_squad.py

NOTE: uses the same demo constants as scoring.py and fixture_analysis.py
(see those files) since the 2026/27 season hasn't started yet and GW38
of last season is the most recent squad we can pull. Once the new season
locks its first gameweek, swap DEMO_GW / FIXTURE_START_EVENT for the real
current/next gameweek and this all keeps working unchanged.
"""

import json
import sys
from datetime import datetime

import pandas as pd

from analysis import compute_player_scores, compute_fixture_difficulty, top_differentials

sys.stdout.reconfigure(encoding="utf-8")
pd.set_option("display.max_columns", None)
pd.set_option("display.width", 200)

REFERENCE_DATE = datetime(2025, 11, 30)  # for player congestion calc
NEXT_EVENT = 10                          # demo "next gameweek" for opponent adjustment
FIXTURE_START_EVENT = 10                 # demo window for "next 5 fixtures" category
WINDOW_SIZE = 5

with open("data/my_entry.json", encoding="utf-8") as f:
    entry = json.load(f)

with open("data/my_picks_demo.json", encoding="utf-8") as f:
    picks_data = json.load(f)

picks = pd.DataFrame(picks_data["picks"])

player_scores = compute_player_scores(REFERENCE_DATE, NEXT_EVENT)
fixture_scores = compute_fixture_difficulty(FIXTURE_START_EVENT, WINDOW_SIZE).set_index("team_id")

squad = picks.merge(player_scores, left_on="element", right_on="id", suffixes=("", "_score"))
squad = squad.merge(
    fixture_scores[["fixture_score", "avg_difficulty", "ticker"]],
    left_on="team", right_index=True,
)
squad = squad.rename(columns={"position_score": "pos"})  # 'position' = squad slot 1-15, 'pos' = GKP/DEF/MID/FWD

squad["role"] = "Bench"
squad.loc[squad["position"] <= 11, "role"] = "Starting XI"

squad["captain_flag"] = ""
squad.loc[squad["is_captain"], "captain_flag"] = "(C)"
squad.loc[squad["is_vice_captain"], "captain_flag"] = "(VC)"

squad = squad.sort_values("position")

print(f"=== {entry['name']} - GW{picks_data['entry_history']['event']} ===")
print(f"Points that GW: {picks_data['entry_history']['points']}  |  "
      f"Squad value: £{picks_data['entry_history']['value'] / 10}m  |  "
      f"Bank: £{picks_data['entry_history']['bank'] / 10}m\n")

display_cols = [
    "position", "web_name", "team_short", "pos", "role", "captain_flag",
    "recommendation_score", "next_opponent", "opponent_multiplier", "rotation_risk",
    "form", "ep_next", "expected_minutes",
]
print("=== Full squad ===")
print(squad[display_cols].to_string(index=False))

starting = squad[squad["role"] == "Starting XI"]
bench = squad[squad["role"] == "Bench"]

print("\n=== Category scores (starting XI, average recommendation_score by position) ===")
for pos in ["GKP", "DEF", "MID", "FWD"]:
    subset = starting[starting["pos"] == pos]
    if len(subset):
        print(f"  {pos}: {subset['recommendation_score'].mean():.3f}  ({len(subset)} players)")

print(f"\n=== Bench depth score (average recommendation_score, {len(bench)} players) ===")
print(f"  {bench['recommendation_score'].mean():.3f}")
print("  (how much quality sits unused on your bench - higher = more comfortable safety net)")

print("\n=== Captaincy options (starting XI, ranked by recommendation_score) ===")
cap_ranked = starting.sort_values("recommendation_score", ascending=False)
print(cap_ranked[["web_name", "team_short", "pos", "recommendation_score", "ep_next", "captain_flag"]]
      .head(5).to_string(index=False))

print(f"\n=== Squad fixture outlook: next {WINDOW_SIZE} gameweeks from GW{FIXTURE_START_EVENT} ===")
print("(higher fixture_score = easier run of fixtures for that club)\n")
squad_fixtures = squad[["team_short", "fixture_score", "avg_difficulty", "ticker"]] \
    .drop_duplicates().sort_values("fixture_score", ascending=False)
print(squad_fixtures.to_string(index=False))

print("\n=== Top differentials (<=10% owned) from the full player pool - not necessarily in your squad ===")
differentials = top_differentials(player_scores, max_ownership=10.0, top_n=10)
print(differentials[["web_name", "team_short", "position", "recommendation_score", "selected_by_percent"]]
      .to_string(index=False))
