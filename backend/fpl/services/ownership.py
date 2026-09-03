"""
Effective ownership within one mini-league, and what it says about a squad.

The arithmetic is in fpl.domain.ownership; this is the part that has to talk to
FPL. One request per manager, which is why the cap below exists: a league of
twelve is twelve requests and about a second, a country league of ninety
thousand is not something to attempt on a page load.

Managers are read in standings order, so when a league is capped the ones kept
are the ones at the top - which is both the cheapest cut and the right one,
since the people above you are the ones whose picks you are actually racing.
"""
import logging
from concurrent.futures import ThreadPoolExecutor

import requests

from fpl.config import FPL_API_BASE, LIVE_BOOTSTRAP_FILE
from fpl.data.loaders import load_bootstrap
from fpl.domain.ownership import differential_verdict, league_differentials

log = logging.getLogger(__name__)

# How many managers' picks a single request will fetch. Twelve-a-side leagues
# and work leagues sit well inside this; anything bigger gets the top of the
# table, which is the part a manager is chasing anyway.
LEAGUE_PICKS_CAP = 50

# Picks are independent reads, so they go out together rather than in series -
# fifty sequential round-trips to FPL is most of a minute. Kept modest because
# FPL rate-limits, and a burst that gets us throttled is slower than patience.
PICKS_CONCURRENCY = 8

TIMEOUT = 30


def _fetch_picks(entry_id, event):
    """
    (entry_id, picks) for one manager, or (entry_id, None) if unreadable.

    A manager who joined late, or whose team was created after this gameweek,
    genuinely has no picks for it. That is not an error worth failing the whole
    league over - they are dropped from the denominator instead, which is the
    honest treatment: they are not a rival for this gameweek.
    """
    try:
        response = requests.get(
            f"{FPL_API_BASE}/entry/{entry_id}/event/{event}/picks/", timeout=TIMEOUT)
        if response.status_code != 200:
            return entry_id, None
        return entry_id, response.json().get("picks")
    except requests.RequestException:
        log.warning("could not read picks for entry %s in GW%s", entry_id, event, exc_info=True)
        return entry_id, None


def league_ownership(league_id, event, team_id=None, max_entries=LEAGUE_PICKS_CAP):
    """
    Effective ownership across a classic league for one gameweek, plus - when
    team_id is given and is in the league - what that manager holds that the
    league does not, and what the league holds that they do not.

    `rivals` is everyone standing above team_id. "Owned by both people above
    you" is a different fact from "owned by 30% of your league", and it is the
    one that decides whether a differential is worth the risk.
    """
    response = requests.get(
        f"{FPL_API_BASE}/leagues-classic/{league_id}/standings/", timeout=TIMEOUT)
    if response.status_code == 404:
        raise ValueError(f"No classic league with id {league_id}")
    response.raise_for_status()
    data = response.json()
    standings = data["standings"]["results"][:max_entries]
    if not standings:
        raise ValueError(f"League {league_id} has no ranked managers yet")

    names = {row["entry"]: row["player_name"] for row in standings}
    your_rank = next((row["rank"] for row in standings if row["entry"] == team_id), None)
    rivals = [row["entry"] for row in standings
              if your_rank is not None and row["rank"] < your_rank]

    with ThreadPoolExecutor(max_workers=PICKS_CONCURRENCY) as pool:
        fetched = pool.map(lambda row: _fetch_picks(row["entry"], event), standings)
    picks_by_entry = {entry: picks for entry, picks in fetched if picks}

    if not picks_by_entry:
        raise ValueError(f"No picks readable for league {league_id} in GW{event}")

    your_picks = picks_by_entry.get(team_id, [])
    your_elements = [p["element"] for p in your_picks]
    result = league_differentials(picks_by_entry, your_elements, rivals=rivals)
    # Named here rather than in the browser: the caller has an element id and
    # no way to turn it into "Haaland (MCI)" without fetching the whole roster
    # a second time.
    result = {
        "your_differentials": _name_rows(result["your_differentials"], you_own=True),
        "your_exposure": _name_rows(result["your_exposure"], you_own=False),
    }

    return {
        "league_id": league_id,
        "event": event,
        "league_name": data["league"]["name"],
        # The denominator, stated rather than implied. A league of 40 where 6
        # managers had no team this gameweek is a league of 34 for this
        # question, and a reader is entitled to know which number they are
        # looking at a percentage of.
        "managers_counted": len(picks_by_entry),
        "managers_in_league": len(standings),
        "capped": len(data["standings"]["results"]) > max_entries,
        "your_rank": your_rank,
        # Whether we found this manager's own picks among the ones counted.
        # Without it an empty differentials list is ambiguous - it could mean
        # "your squad matches your league exactly" or "we could not find you",
        # and those deserve opposite sentences.
        "you_are_counted": bool(your_picks),
        "rivals_above_you": [names[e] for e in rivals if e in names],
        **result,
    }


def _name_rows(rows, you_own):
    """Attach who each element id actually is, and a phrase for how exposed it makes you."""
    bootstrap = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    teams = {t["id"]: t["short_name"] for t in bootstrap["teams"]}
    positions = {p["id"]: p["singular_name_short"] for p in bootstrap["element_types"]}
    players = {
        p["id"]: {
            "web_name": p["web_name"],
            "team_short": teams.get(p["team"], ""),
            "pos": positions.get(p["element_type"], ""),
        }
        for p in bootstrap["elements"]
    }
    return [
        {**row, **players.get(row["element"], {"web_name": f"#{row['element']}",
                                               "team_short": "", "pos": ""}),
         "verdict": differential_verdict(row, you_own=you_own)}
        for row in rows
    ]
