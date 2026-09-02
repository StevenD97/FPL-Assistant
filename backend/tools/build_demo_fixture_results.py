"""
One-off data edit for the demo branch: fills in plausible final scores for
GW1-14 of data/fixtures.json (finished=True, started=True, minutes=90 - the
same shape a real completed fixture has), so the Matches page and fixture-
difficulty ticker look consistent with the demo's "GW14 just finished"
gameweek context (see data/bootstrap_static.json's events[] and
fpl.domain.gameweek.get_gw_context). GW15+ are left untouched (upcoming,
unplayed).

Scores are sampled from each side's FPL-provided fixture difficulty rating
(team_h_difficulty/team_a_difficulty, already in the file) via a seeded
Poisson draw - deterministic (re-running this script reproduces the same
results) and biased the way real football roughly is: an easier fixture for
a side skews its expected goals up.

Not part of the running app - run once, edits data/fixtures.json in place.

Run: python tools/build_demo_fixture_results.py
"""
import json
import math
import random

from fpl.config import DATA_DIR

SIM_LAST_EVENT = 14
FIXTURES_PATH = DATA_DIR / "fixtures.json"

# FPL difficulty is 1 (easiest) - 5 (hardest); centered on 3.
BASE_XG_HOME = 1.55
BASE_XG_AWAY = 1.25
DIFFICULTY_SLOPE = 0.16


def _poisson(xg, seed):
    rng = random.Random(seed)
    lam = math.exp(-xg)
    k, p = 0, 1.0
    while True:
        k += 1
        p *= rng.random()
        if p <= lam:
            return k - 1


def build():
    with open(FIXTURES_PATH) as f:
        fixtures = json.load(f)

    changed = 0
    for fx in fixtures:
        if fx.get("event") is None or fx["event"] > SIM_LAST_EVENT:
            continue
        xg_h = max(0.3, BASE_XG_HOME - DIFFICULTY_SLOPE * (fx["team_h_difficulty"] - 3))
        xg_a = max(0.3, BASE_XG_AWAY - DIFFICULTY_SLOPE * (fx["team_a_difficulty"] - 3))
        fx["team_h_score"] = _poisson(xg_h, seed=fx["id"] * 2)
        fx["team_a_score"] = _poisson(xg_a, seed=fx["id"] * 2 + 1)
        fx["finished"] = True
        fx["finished_provisional"] = True
        fx["started"] = True
        fx["provisional_start_time"] = False
        fx["minutes"] = 90
        changed += 1

    with open(FIXTURES_PATH, "w") as f:
        json.dump(fixtures, f, separators=(",", ":"))
    print(f"updated {changed} fixtures (GW1-{SIM_LAST_EVENT})")


if __name__ == "__main__":
    build()
