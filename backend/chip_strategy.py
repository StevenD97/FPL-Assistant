"""
Phase D: chip strategy - recommend timing for Wildcard, Free Hit, Bench
Boost, and Triple Captain based on your squad and the fixture calendar.

Run with: venv\\Scripts\\python.exe chip_strategy.py

NOTE: assumes your current 15 stay unchanged across the scan window - in
reality you'd re-run this after each set of transfers. Scan window is set
to GW24-36 of last season as a demo, since that's where the known
blank/double gameweeks fall (see fixture_analysis.py output). Once the
2026/27 season is live, point SCAN_START_EVENT/SCAN_END_EVENT at the
actual upcoming gameweeks instead.
"""

import json
import sys
from collections import Counter
from datetime import datetime

import pandas as pd

from analysis import compute_player_scores, load_bootstrap, load_fixtures, detect_blank_double_gameweeks

sys.stdout.reconfigure(encoding="utf-8")
pd.set_option("display.max_columns", None)
pd.set_option("display.width", 200)

SCAN_START_EVENT = 24
SCAN_END_EVENT = 37  # exclusive; scans GW24..GW36

# Archived 2025/26 files, matching compute_player_scores' own default below -
# FPL reassigns team ids every season, so mixing this with live fixture data
# would silently detect blank/double gameweeks for the wrong teams, and
# event_deadlines would resolve GW24 etc. to the wrong season's real dates.
bootstrap = load_bootstrap("bootstrap_static_2025_26_final.json")
fixtures = load_fixtures("fixtures_2025_26_final.json")

event_deadlines = {
    e["id"]: datetime.strptime(e["deadline_time"], "%Y-%m-%dT%H:%M:%SZ")
    for e in bootstrap["events"]
}

with open("data/my_picks_demo.json", encoding="utf-8") as f:
    picks_data = json.load(f)

picks = pd.DataFrame(picks_data["picks"])
squad_element_ids = picks["element"].tolist()
bench_element_ids = picks.loc[picks["position"] > 11, "element"].tolist()

scan_events = list(range(SCAN_START_EVENT, SCAN_END_EVENT))

rows = []
for event in scan_events:
    reference_date = event_deadlines[event]
    scores = compute_player_scores(reference_date, event)

    squad_scores = scores[scores["id"].isin(squad_element_ids)]
    bench_scores = scores[scores["id"].isin(bench_element_ids)]
    best_captain_idx = squad_scores["recommendation_score"].idxmax()

    rows.append({
        "event": event,
        "squad_total_score": squad_scores["recommendation_score"].sum(),
        "bench_score": bench_scores["recommendation_score"].sum(),
        "best_captain_score": squad_scores["recommendation_score"].max(),
        "best_captain_name": squad_scores.loc[best_captain_idx, "web_name"],
        "blank_count": int((squad_scores["fixture_count"] == 0).sum()),
        "double_count": int((squad_scores["fixture_count"] >= 2).sum()),
    })

chip_table = pd.DataFrame(rows)

print(f"=== Chip planner scan: GW{SCAN_START_EVENT} to GW{SCAN_END_EVENT - 1} ===")
print("(assumes your current 15 stay unchanged across this window)\n")
print(chip_table.to_string(index=False))

# --- Bench Boost: best week = highest combined bench score ---
bb_row = chip_table.loc[chip_table["bench_score"].idxmax()]
print("\n=== Bench Boost recommendation ===")
print(f"  Best week: GW{int(bb_row['event'])} (bench score {bb_row['bench_score']:.3f}, "
      f"{int(bb_row['double_count'])} of your squad have a double that week)")

# --- Triple Captain: best week = your single highest-scoring player ---
tc_row = chip_table.loc[chip_table["best_captain_score"].idxmax()]
print("\n=== Triple Captain recommendation ===")
print(f"  Best week: GW{int(tc_row['event'])} - {tc_row['best_captain_name']} "
      f"(captain score {tc_row['best_captain_score']:.3f})")

# --- Free Hit: best week = most of your squad blanking ---
fh_row = chip_table.loc[chip_table["blank_count"].idxmax()]
print("\n=== Free Hit recommendation ===")
if fh_row["blank_count"] >= 3:
    print(f"  Best week: GW{int(fh_row['event'])} - {int(fh_row['blank_count'])} of your 15 have no fixture that week")
else:
    print(f"  No strong Free Hit case in this window (worst week only blanks "
          f"{int(fh_row['blank_count'])} of your 15) - hold the chip")

# --- Wildcard: look league-wide for the biggest blank/double cluster ahead ---
blanks, doubles = detect_blank_double_gameweeks(bootstrap, fixtures)
doubles_in_scan = [d for d in doubles if SCAN_START_EVENT <= d[0] < SCAN_END_EVENT]
blanks_in_scan = [b for b in blanks if SCAN_START_EVENT <= b[0] < SCAN_END_EVENT]

double_counts_by_event = Counter(event for event, _, _ in doubles_in_scan)
blank_counts_by_event = Counter(event for event, _ in blanks_in_scan)

print("\n=== Wildcard recommendation ===")
if double_counts_by_event:
    biggest_dgw_event, num_teams = double_counts_by_event.most_common(1)[0]
    print(f"  League-wide, GW{biggest_dgw_event} has the most teams doubling ({num_teams} teams).")
    print(f"  Classic strategy: wildcard around GW{biggest_dgw_event - 1} to load up on "
          f"double-gameweek assets before it hits.")
elif blank_counts_by_event:
    biggest_bgw_event, num_teams = blank_counts_by_event.most_common(1)[0]
    print(f"  League-wide, GW{biggest_bgw_event} has the most teams blanking ({num_teams} teams).")
    print("  Consider wildcarding out of the teams that blank, or pairing with Free Hit instead.")
else:
    print("  No major blank/double gameweek cluster found in this scan window.")
