"""
Phase A: team-level fixture difficulty scoring + blank/double gameweek
detection - see analysis.py for the actual logic.

Run with: python -m tools.prototypes.fixture_analysis  (from the backend/ folder)

NOTE ON GAMEWEEK: see analysis.py notes - START_EVENT is a demo value
picked from last season. Once 2026/27 is live, compute the real "next"
gameweek automatically instead (first event where finished == False).
"""

import sys

import pandas as pd

from fpl.data.loaders import load_bootstrap, load_fixtures
from fpl.domain.fixtures import compute_fixture_difficulty
from fpl.domain.gameweek import detect_blank_double_gameweeks

sys.stdout.reconfigure(encoding="utf-8")
pd.set_option("display.max_columns", None)
pd.set_option("display.width", 200)

START_EVENT = 10
WINDOW_SIZE = 5

bootstrap = load_bootstrap()
fixtures = load_fixtures()

blanks, doubles = detect_blank_double_gameweeks(bootstrap, fixtures)

print("=== Blank gameweeks (a team with 0 fixtures) ===")
if blanks:
    for event, short_name in blanks:
        print(f"  GW{event}: {short_name} has no fixture")
else:
    print("  (none found)")

print("\n=== Double gameweeks (a team with 2+ fixtures) ===")
if doubles:
    for event, short_name, count in doubles:
        print(f"  GW{event}: {short_name} has {count} fixtures")
else:
    print("  (none found)")

df = compute_fixture_difficulty(START_EVENT, WINDOW_SIZE).sort_values("fixture_score", ascending=False)

print(f"\n=== Fixture difficulty ranking: next {WINDOW_SIZE} gameweeks from GW{START_EVENT} ===")
print("(higher fixture_score = easier run of fixtures; accounts for doubles/blanks)\n")
print(df.drop(columns="team_id").to_string(index=False))
