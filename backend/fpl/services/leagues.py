"""
League-facing orchestration: a manager's classic leagues, and a public
classic league's standings (with each shown manager's current-season
points trend and, optionally, where a given manager's score would rank).

Hits FPL's public standings endpoints directly via requests (independent of
the ingest client's Session). "Not found" is raised as ValueError for the
router to translate into a CORS-correct 404.
"""
import requests

from fpl.config import FPL_API_BASE
from fpl.data.entry import fetch_entry_info

LEAGUE_STANDINGS_ENTRY_CAP = 20
# How many standings pages (roughly LEAGUE_RANK_SEARCH_PAGE_CAP * 50 entries)
# to walk when estimating where a manager would rank in a public league - see
# estimate_rank_in_league. Bounds worst-case latency for a league too large to
# search exhaustively (e.g. a widely-shared country league) at a handful of
# seconds, rather than one request per member.
LEAGUE_RANK_SEARCH_PAGE_CAP = 20


def manager_leagues(team_id):
    """This manager's classic (non-H2H) leagues - id/name/rank - for the Leagues page's league picker."""
    response = requests.get(f"{FPL_API_BASE}/entry/{team_id}/", timeout=30)
    if response.status_code == 404:
        raise ValueError(f"No FPL manager with team id {team_id}")
    response.raise_for_status()
    entry = response.json()
    return [
        {"id": lg["id"], "name": lg["name"], "entry_rank": lg["entry_rank"]}
        for lg in entry["leagues"]["classic"]
    ]


def estimate_rank_in_league(league_id, target_points, page_cap=LEAGUE_RANK_SEARCH_PAGE_CAP):
    """
    Where target_points would rank within a public classic league's standings
    (sorted by total points descending). Walks standings pages (~50 entries
    each) linearly rather than downloading the whole league - O(page_cap)
    requests worst case, stopping as soon as target_points would insert into
    the current page.

    Returns (found, rank_or_none, entries_searched):
      - found=True: rank_or_none is target_points' exact 1-indexed rank.
      - found=False: target_points is lower than every entry searched -
        rank_or_none is None; entries_searched lets the caller say "beyond
        the top N" honestly instead of guessing.
    """
    entries_seen = 0
    for page in range(1, page_cap + 1):
        response = requests.get(
            f"{FPL_API_BASE}/leagues-classic/{league_id}/standings/",
            params={"page_standings": page}, timeout=30,
        )
        response.raise_for_status()
        results = response.json()["standings"]["results"]
        if not results:
            # Ran off the end of a league smaller than page_cap * page size.
            return True, entries_seen + 1, entries_seen
        for row in results:
            entries_seen += 1
            if target_points >= row["total"]:
                return True, entries_seen, entries_seen
        if not response.json()["standings"]["has_next"]:
            return True, entries_seen + 1, entries_seen
    return False, None, entries_seen


def league_standings(league_id, max_entries=LEAGUE_STANDINGS_ENTRY_CAP, team_id=None):
    """
    Standings for a classic league, plus each shown manager's gameweek-by-
    gameweek total-points trend for the current season. Capped at max_entries
    managers (ranked by current standing). Works for any public classic league.

    team_id, if given, adds "your_rank": that manager's own current-season
    total inserted into this league's full standings via estimate_rank_in_league.
    None if team_id is omitted or the manager lookup fails.
    """
    response = requests.get(f"{FPL_API_BASE}/leagues-classic/{league_id}/standings/", timeout=30)
    if response.status_code == 404:
        raise ValueError(f"No classic league with id {league_id}")
    response.raise_for_status()
    data = response.json()
    results = data["standings"]["results"][:max_entries]

    trend_entries = []
    for row in results:
        hist_response = requests.get(f"{FPL_API_BASE}/entry/{row['entry']}/history/", timeout=30)
        hist_response.raise_for_status()
        current = hist_response.json()["current"]
        trend_entries.append({
            "entry_id": row["entry"],
            "player_name": row["player_name"],
            "entry_name": row["entry_name"],
            "series": [{"event": gw["event"], "total_points": gw["total_points"]} for gw in current],
        })

    your_rank = None
    if team_id is not None:
        try:
            manager = fetch_entry_info(team_id)
            target_points = manager.get("summary_overall_points")
            if target_points is not None:
                found, rank, searched = estimate_rank_in_league(league_id, target_points)
                your_rank = {
                    "team_id": team_id,
                    "total_points": target_points,
                    "rank": rank,
                    "searched_at_least": searched,
                    "found_exact": found,
                }
        except requests.exceptions.HTTPError:
            your_rank = None  # bad/unfetchable team_id - omit rather than fail the whole standings request

    return {
        "league_name": data["league"]["name"],
        "standings": [
            {
                "entry_id": r["entry"], "player_name": r["player_name"], "entry_name": r["entry_name"],
                "rank": r["rank"], "last_rank": r["last_rank"], "total": r["total"], "event_total": r["event_total"],
            }
            for r in results
        ],
        "trend": trend_entries,
        "your_rank": your_rank,
    }
