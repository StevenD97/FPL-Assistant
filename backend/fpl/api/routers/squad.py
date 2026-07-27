"""
Manager/squad endpoints: entry summary, the Squad Builder pool + fixtures, and
the four live-squad views (analysis, chips, transfer optimisation, planner).

The live-squad routes fetch a manager's picks from FPL and map its HTTP errors
to CORS-correct HTTPExceptions here (the messages depend on request-scoped
team_id/event); the heavy computation lives in fpl.services.squad. FPL's
season-boundary 404s are very common, so left unhandled they would surface as
opaque, header-less 500s (Starlette's ServerErrorMiddleware sits outside
CORSMiddleware) - hence the explicit translation on every one.
"""
from typing import Optional

import requests
from fastapi import APIRouter, HTTPException

from fpl.api.errors import not_found_detail
from fpl.data.entry import fetch_entry_info, fetch_entry_picks
from fpl.services import squad as service
from fpl.services.common import resolve_gw_params

router = APIRouter()


@router.get("/api/squad-builder/players")
def squad_builder_players(
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
):
    ref_date, next_event = resolve_gw_params(reference_date, next_event)
    return service.squad_builder_players(ref_date, next_event, gw_count=gw_count)


@router.get("/api/squad-builder/fixtures")
def squad_builder_fixtures(next_event: Optional[int] = None, gw_count: int = 5):
    return service.squad_builder_fixtures(next_event, gw_count=gw_count)


@router.get("/api/entry/{team_id}")
def entry_summary(team_id: int):
    try:
        return service.entry_summary(team_id)
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else 502
        if status == 404:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No FPL manager found for ID {team_id}. Copy the ID from your team's URL: "
                    "fantasy.premierleague.com/entry/<ID>/event/..."
                ),
            )
        raise HTTPException(status_code=502, detail=f"FPL API error: {e}")


@router.get("/api/squad/{team_id}/chips")
def chip_strategy(team_id: int, scan_start_event: int = 24, scan_end_event: int = 37):
    try:
        return service.chip_strategy(team_id, scan_start_event, scan_end_event)
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else 502
        if status == 404:
            raise HTTPException(status_code=404, detail=not_found_detail(team_id, "their most recent gameweek"))
        raise HTTPException(status_code=502, detail=f"FPL API error: {e}")


@router.get("/api/squad/{team_id}/optimize-transfers")
def squad_optimize_transfers(
    team_id: int,
    event: Optional[int] = None,
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
    free_transfers: int = 1,
    max_transfers: Optional[int] = None,
):
    ref_date, next_event = resolve_gw_params(reference_date, next_event)
    if event is None:
        entry = fetch_entry_info(team_id)
        event = entry.get("current_event")
        if event is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Manager {team_id} has no current_event yet - the season hasn't started "
                    "(no gameweek has locked for them yet), so there's no squad to suggest transfers from."
                ),
            )
    try:
        picks_data = fetch_entry_picks(team_id, event)
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else 502
        if status == 404:
            raise HTTPException(status_code=404, detail=not_found_detail(team_id, event))
        raise HTTPException(status_code=502, detail=f"FPL API error: {e}")
    current_squad_ids = [pick["element"] for pick in picks_data["picks"]]
    bank = picks_data["entry_history"]["bank"]
    return service.optimize_transfers_compute(
        current_squad_ids, bank, ref_date, next_event,
        gw_count=gw_count, free_transfers=free_transfers, max_transfers=max_transfers,
    )


@router.get("/api/squad/{team_id}/planner")
def squad_planner(
    team_id: int,
    event: Optional[int] = None,
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 6,
):
    ref_date, next_event = resolve_gw_params(reference_date, next_event)
    if event is None:
        entry = fetch_entry_info(team_id)
        event = entry.get("current_event")
        if event is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Manager {team_id} has no current_event yet - the season hasn't started "
                    "(no gameweek has locked for them yet), so there's no squad to plan around."
                ),
            )
    try:
        picks_data = fetch_entry_picks(team_id, event)
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else 502
        if status == 404:
            raise HTTPException(status_code=404, detail=not_found_detail(team_id, event))
        raise HTTPException(status_code=502, detail=f"FPL API error: {e}")
    squad_element_ids = {pick["element"] for pick in picks_data["picks"]}
    return service.squad_planner_compute(squad_element_ids, event, ref_date, next_event, gw_count=gw_count)


@router.get("/api/squad/{team_id}")
def squad_analysis(
    team_id: int,
    event: Optional[int] = None,
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    fixture_start_event: Optional[int] = None,
    window_size: int = 5,
):
    ref_date, next_event = resolve_gw_params(reference_date, next_event)
    try:
        return service.squad_analysis(team_id, event, ref_date, next_event, fixture_start_event, window_size)
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else 502
        if status == 404:
            raise HTTPException(status_code=404, detail=not_found_detail(team_id, event or "their current gameweek"))
        raise HTTPException(status_code=502, detail=f"FPL API error: {e}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
