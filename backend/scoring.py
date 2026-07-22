"""
First-pass recommendation scoring - see analysis.py for the actual logic.

Run with: venv\\Scripts\\python.exe scoring.py

NOTE ON DATES: see analysis.py / README notes - REFERENCE_DATE and NEXT_EVENT
are demo values inside last season since the 2026/27 fixtures aren't
published yet.
"""

import sys
from datetime import datetime

import pandas as pd

from analysis import compute_player_scores, top_differentials

sys.stdout.reconfigure(encoding="utf-8")
pd.set_option("display.max_columns", None)
pd.set_option("display.width", 200)

REFERENCE_DATE = datetime(2025, 11, 30)  # demo date; a real congested week last season
NEXT_EVENT = 10                          # demo "next gameweek" for opponent adjustment

df = compute_player_scores(REFERENCE_DATE, NEXT_EVENT)
ranked = df.sort_values("recommendation_score", ascending=False)

display_cols = [
    "web_name", "team_short", "position", "recommendation_score",
    "confidence_adjusted", "rotation_risk", "next_opponent", "opponent_multiplier",
    "form", "ep_next", "expected_minutes",
]

print("=== Top 20 by recommendation score ===")
print(ranked[display_cols].head(20).to_string(index=False))

print("\n=== Bottom 10 by recommendation score (sanity check - should be poor options) ===")
print(ranked[display_cols].tail(10).to_string(index=False))

print("\n=== Top 15 differentials (recommendation score, <=10% owned) ===")
differentials = top_differentials(df, max_ownership=10.0, top_n=15)
diff_cols = display_cols + ["selected_by_percent"]
print(differentials[diff_cols].to_string(index=False))
