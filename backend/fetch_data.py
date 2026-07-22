"""
Pulls live data from the official FPL API (public, no login needed) and
saves it to the data/ folder as JSON, so we can explore it like we did
the CSV.

Run with: venv\\Scripts\\python.exe fetch_data.py
"""

import json
import requests

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
    fetch_and_save(f"{BASE}/bootstrap-static/", "bootstrap_static.json")
    fetch_and_save(f"{BASE}/fixtures/", "fixtures.json")
