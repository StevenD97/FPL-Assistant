"""League endpoints: a manager's classic leagues, and a public league's standings."""
from typing import Optional

from fastapi import APIRouter, HTTPException

from fpl.services import leagues as service
from fpl.services.leagues import LEAGUE_STANDINGS_ENTRY_CAP

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
