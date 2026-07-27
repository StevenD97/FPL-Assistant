"""
Phase C: squad-level category scoring for your actual FPL team.

Run with: python -m tools.prototypes.my_squad  (from the backend/ folder)

NOTE: compute_player_scores/compute_fixture_difficulty below are pinned to
the archived 2025/26 season by default (unlike app/main.py's live
endpoints - see analysis.get_gw_context, which is deliberately NOT used
here) - the archived season is fully finished, so there's no "current
gameweek" to derive from it dynamically; REFERENCE_DATE/NEXT_EVENT/
FIXTURE_START_EVENT below are a fixed point partway through that archive,
same as scoring.py. `data/my_picks_demo.json`/`data/my_entry.json` are
static snapshots fetched separately by fetch_my_team.py against the LIVE
API - once that's re-run against your real, current-season squad, this
script would need a live-roster split (like app/main.py's endpoints have)
to match player identities correctly, not just an updated reference date.
"""

import json
import sys
from datetime import datetime

import pandas as pd

from fpl.config import DATA_DIR
from fpl.domain.fixtures import compute_fixture_difficulty
from fpl.domain.scoring import compute_player_scores, top_differentials

sys.stdout.reconfigure(encoding="utf-8")
pd.set_option("display.max_columns", None)
pd.set_option("display.width", 200)

REFERENCE_DATE = datetime(2025, 11, 30)  # for player congestion calc
NEXT_EVENT = 10                          # demo "next gameweek" for opponent adjustment
FIXTURE_START_EVENT = 10                 # demo window for "next 5 fixtures" category
WINDOW_SIZE = 5

with open(DATA_DIR / "my_entry.json", encoding="utf-8") as f:
    entry = json.load(f)

with open(DATA_DIR / "my_picks_demo.json", encoding="utf-8") as f:
    picks_data = json.load(f)

picks = pd.DataFrame(picks_data["picks"])

player_scores = compute_player_scores(REFERENCE_DATE, NEXT_EVENT)
# Must point at the same season as player_scores (compute_player_scores now
# defaults to the archived 2025/26 files) - FPL reassigns team ids every
# season, so merging this against live fixture data would silently attach
# the wrong team's fixture ticker to a player. See analysis.py's docstrings.
fixture_scores = compute_fixture_difficulty(
    FIXTURE_START_EVENT, WINDOW_SIZE,
    bootstrap_file="bootstrap_static_2025_26_final.json", fixtures_file="fixtures_2025_26_final.json",
).set_index("team_id")

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
