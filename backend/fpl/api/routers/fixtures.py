"""Fixture endpoints: the difficulty table and the season schedule."""
from typing import Optional

from fastapi import APIRouter

from fpl.services import fixtures as service

router = APIRouter()


@router.get("/api/fixtures/difficulty")
def fixture_difficulty(start_event: Optional[int] = None, window_size: int = 5):
    return service.fixture_difficulty(start_event, window_size)


@router.get("/api/fixtures/schedule")
def fixtures_schedule(season: str = "live"):
    return service.fixtures_schedule(season)
