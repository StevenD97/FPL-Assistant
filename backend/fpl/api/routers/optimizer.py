"""Optimizer endpoint: the best-value squad under budget."""
from typing import Optional

from fastapi import APIRouter

from fpl.services import optimizer as service
from fpl.services.common import resolve_gw_params

router = APIRouter()


@router.get("/api/optimizer/best-squad")
def optimizer_best_squad(
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
    budget: int = 1000,
):
    ref_date, next_event = resolve_gw_params(reference_date, next_event)
    return service.best_squad(ref_date, next_event, gw_count=gw_count, budget=budget)
