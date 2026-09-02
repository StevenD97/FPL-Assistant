"""
Player endpoints: recommendation scores, both prediction endpoints, the
full-roster browser, single-player detail, replacement suggestions,
per-gameweek trajectory, and the price-change watch.

Literal-suffix routes (/scores, /price-watch, …) are registered before the
`/{player_id}` route so an int path param never shadows them.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException

from fpl.services import players as service
from fpl.services.common import resolve_gw_params

router = APIRouter()


@router.get("/api/players/price-watch")
def price_watch(limit: int = 20, history_hours: int = 48, player_ids: Optional[str] = None):
    return service.price_watch(limit=limit, history_hours=history_hours, player_ids=player_ids)


@router.get("/api/players/scores")
def player_scores(
    reference_date: str = "2025-11-30",
    next_event: int = 10,
    max_ownership: Optional[float] = None,
    limit: int = 50,
):
    ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
    return service.player_scores(ref_date, next_event, max_ownership=max_ownership, limit=limit)


@router.get("/api/players/predicted-points")
def player_predicted_points(reference_date: str = "2025-11-30", next_event: int = 10, limit: int = 50):
    ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
    return service.predicted_points(ref_date, next_event, limit=limit)


@router.get("/api/players/predicted-points-outlook")
def player_predicted_points_outlook(
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
    limit: int = 50,
):
    ref_date, next_event = resolve_gw_params(reference_date, next_event)
    return service.predicted_points_outlook(ref_date, next_event, gw_count=gw_count, limit=limit)


@router.get("/api/players")
def all_players(
    search: Optional[str] = None,
    position: Optional[str] = None,
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
    limit: int = 600,
):
    ref_date, next_event = resolve_gw_params(reference_date, next_event)
    return service.all_players(search, position, ref_date, next_event, gw_count=gw_count, limit=limit)


@router.get("/api/players/{player_id}/trajectory")
def player_trajectory(
    player_id: int,
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 6,
):
    ref_date, next_event = resolve_gw_params(reference_date, next_event)
    try:
        return service.player_trajectory(player_id, ref_date, next_event, gw_count=gw_count)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/api/players/{player_id}/alternatives")
def player_alternatives(
    player_id: int,
    exclude: Optional[str] = None,
    limit: int = 5,
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
    max_cost: Optional[float] = None,
):
    ref_date, next_event = resolve_gw_params(reference_date, next_event)
    try:
        return service.player_alternatives(
            player_id, exclude, limit, ref_date, next_event, gw_count=gw_count, max_cost=max_cost
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/api/players/{player_id}/comparison")
def player_comparison(
    player_id: int,
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
):
    """
    "What about X?" - how this player compares to the best the model can find
    in the same position at or under the same price, and why.
    """
    ref_date, next_event = resolve_gw_params(reference_date, next_event)
    try:
        return service.player_comparison(player_id, ref_date, next_event, gw_count=gw_count)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/api/players/{player_id}")
def player_detail(
    player_id: int,
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
):
    ref_date, next_event = resolve_gw_params(reference_date, next_event)
    try:
        return service.player_detail(player_id, ref_date, next_event, gw_count=gw_count)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
