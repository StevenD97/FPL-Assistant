"""League endpoints: a manager's classic leagues, a public league's standings,
and effective ownership within one."""
from typing import Optional

from fastapi import APIRouter, HTTPException

from fpl.services import leagues as service
from fpl.services import ownership as ownership_service
from fpl.services.leagues import LEAGUE_STANDINGS_ENTRY_CAP
from fpl.services.ownership import LEAGUE_PICKS_CAP

router = APIRouter()


@router.get("/api/leagues/{team_id}")
def manager_leagues(team_id: int):
    try:
        return service.manager_leagues(team_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/api/leagues/{league_id}/standings")
def league_standings(league_id: int, max_entries: int = LEAGUE_STANDINGS_ENTRY_CAP, team_id: Optional[int] = None):
    try:
        return service.league_standings(league_id, max_entries=max_entries, team_id=team_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/api/leagues/{league_id}/ownership")
def league_ownership(league_id: int, event: int, team_id: Optional[int] = None,
                     max_entries: int = LEAGUE_PICKS_CAP):
    """
    Effective ownership across a league for one gameweek - who is exposed to
    whom, rather than the game's own "selected by 43.2%", which counts a
    benched player the same as a captained one.

    `event` is required rather than defaulted to the current gameweek: picks
    are only meaningful for a specific week, and quietly guessing which one
    would make a stale answer indistinguishable from a fresh one.
    """
    try:
        return ownership_service.league_ownership(
            league_id, event, team_id=team_id, max_entries=max_entries)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
