"""
Run this occasionally to check whether FPL has reset bootstrap-static for
the 2026/27 season yet. Once it has, we can build the draft helper against
the real new roster (new signings, promoted teams, current prices).

Run with: venv\\Scripts\\python.exe check_new_season.py
"""

import requests

response = requests.get("https://fantasy.premierleague.com/api/bootstrap-static/", timeout=30)
response.raise_for_status()
data = response.json()

current_event = next((e for e in data["events"] if e["is_current"]), None)
next_event = next((e for e in data["events"] if e["is_next"]), None)
any_unfinished = any(not e["finished"] for e in data["events"])

print("Total gameweeks in events:", len(data["events"]))
print("Current event:", current_event["name"] if current_event else None)
print("Next event:", next_event["name"] if next_event else None)
print("Any unfinished gameweeks:", any_unfinished)
print("Sample player count:", len(data["elements"]))

if any_unfinished or (current_event is None and next_event is not None):
    print("\n=> Looks like the new season may be live or about to start. Worth checking manually.")
else:
    print("\n=> Still looks like the old (finished) season - not reset yet.")
