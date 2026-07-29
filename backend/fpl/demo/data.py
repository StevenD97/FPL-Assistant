"""
Demo mode: every manager lookup (any team id) resolves to the same fixed
squad, so every visitor to the demo deployment sees an identical, fully-
populated "My Squad" with real GW1-14 stats behind it and logical transfer
recommendations coming out the other end - see backend/tools/build_demo_squad.py
for how the squad itself was generated (the app's own optimizer, restricted
to players with real 2025/26 archived history) and demo_squad.json for the
frozen result.

Only active when fpl.config.get_settings().demo_mode is set (the `demo`
branch's own deployment sets FPL_DEMO_MODE=1); every other deployment is
unaffected.
"""
import json
from functools import lru_cache
from pathlib import Path

DEMO_LEAGUE_ID = 999001


@lru_cache
def _snapshot():
    path = Path(__file__).parent / "demo_squad.json"
    with open(path) as f:
        return json.load(f)


def demo_entry_info(team_id):
    """Same fixed manager info regardless of team_id - see fpl.data.entry."""
    snap = _snapshot()
    return {**snap["entry_info"], "id": team_id}


def demo_entry_picks(team_id, event):
    """Same fixed 15-man squad regardless of team_id/event - see fpl.data.entry."""
    snap = _snapshot()
    return {"picks": snap["picks"], "entry_history": snap["entry_history"]}


def demo_manager_leagues(team_id):
    """Fixed classic-league membership, for fpl.services.leagues.manager_leagues."""
    snap = _snapshot()
    return snap["entry_info"]["leagues"]["classic"]


def demo_league_standings(league_id, team_id=None):
    """Fixed standings for the demo squad's own league; None for any other league id
    (callers fall back to the real FPL API for those)."""
    if league_id != DEMO_LEAGUE_ID:
        return None
    snap = _snapshot()
    your_rank = None
    if team_id is not None:
        demo_row = next(r for r in snap["league_standings"]["standings"] if r["entry_id"] == 0)
        your_rank = {
            "team_id": team_id,
            "total_points": demo_row["total"],
            "rank": demo_row["rank"],
            "searched_at_least": len(snap["league_standings"]["standings"]),
            "found_exact": True,
        }
    return {**snap["league_standings"], "trend": [], "your_rank": your_rank}
