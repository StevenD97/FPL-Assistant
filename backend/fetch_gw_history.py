"""
Pulls 2025-26 season gameweek-by-gameweek player data from the vaastav/
Fantasy-Premier-League community archive (github.com/vaastav/Fantasy-Premier-League).

The official FPL API only exposes per-gameweek history for the *current*
season - once a new season starts, a player's history collapses into a
single aggregated history_past row per season with no gameweek breakdown.
This archive is the only way to get 2025-26's gameweek-by-gameweek data
now that the live API has moved on to 2026/27 (and is in any case
unavailable during FPL's close-season "Game Updating" maintenance window).

Run with: venv\\Scripts\\python.exe fetch_gw_history.py
"""

import requests

SEASON = "2025-26"
URL = f"https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/{SEASON}/gws/merged_gw.csv"
OUT_PATH = f"data/gw_history_{SEASON.replace('-', '_')}.csv"

if __name__ == "__main__":
    print(f"Fetching {URL} ...")
    response = requests.get(URL, timeout=30)
    response.raise_for_status()
    with open(OUT_PATH, "wb") as f:
        f.write(response.content)
    print(f"  Saved to {OUT_PATH}")
