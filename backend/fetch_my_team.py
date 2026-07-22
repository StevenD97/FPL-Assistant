"""
Phase C: pull your actual FPL squad via your public team ID.
No login needed - this is all public data.

Run with: venv\\Scripts\\python.exe fetch_my_team.py

NOTE: the 2026/27 season hasn't started yet (no gameweek picks exist for it
yet). So for now we pull GW38 of last season (2025/26) - the most recent
completed gameweek - just to validate the plumbing works end-to-end. Once
GW1 of the new season locks (after the Aug 21 deadline), we switch to
pulling that instead.
"""

import json

import requests

TEAM_ID = 1178869
DEMO_GW = 38  # last completed gameweek of 2025/26; update to 1 once new season locks

BASE = "https://fantasy.premierleague.com/api"
OUT_DIR = "data"


def fetch_and_save(url, filename):
    print(f"Fetching {url} ...")
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    data = response.json()
    path = f"{OUT_DIR}/{filename}"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"  Saved to {path}")
    return data


if __name__ == "__main__":
    fetch_and_save(f"{BASE}/entry/{TEAM_ID}/", "my_entry.json")
    fetch_and_save(f"{BASE}/entry/{TEAM_ID}/history/", "my_entry_history.json")
    fetch_and_save(f"{BASE}/entry/{TEAM_ID}/event/{DEMO_GW}/picks/", "my_picks_demo.json")
