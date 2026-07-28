"""Team endpoints: the club index and one club's per-metric top-5 leaderboards."""
from typing import Optional

from fastapi import APIRouter, HTTPException

from fpl.services import teams as service
from fpl.services.common import resolve_gw_params

router = APIRouter()


@router.get("/api/teams")
def list_teams():
    return service.list_teams()


@router.get("/api/teams/{team_id}")
def team_detail(
    team_id: int,
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
):
    ref_date, event = resolve_gw_params(reference_date, next_event)
    try:
        return service.team_detail(team_id, ref_date, event, gw_count=gw_count)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
