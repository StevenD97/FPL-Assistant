"""Liveness / readiness / season-context endpoints."""
from fastapi import APIRouter, HTTPException

from fpl.domain.gameweek import get_gw_context

router = APIRouter()


@router.get("/api/health")
def health():
    """Liveness: the process is up. Used by the keep-alive ping."""
    return {"status": "ok"}


@router.get("/api/ready")
def ready():
    """
    Readiness: can we actually serve? Checks DB connectivity.

    fpl.data.db.session builds its Engine at import time, so a genuinely broken
    DATABASE_URL raises on that import itself, before db_healthy()'s own
    try/except gets a chance to run. Catching broadly here keeps this
    endpoint's promise: always a clean, CORS-correct response, never an
    opaque crash (Starlette's ServerErrorMiddleware sits outside CORSMiddleware).
    """
    try:
        from fpl.data.db.session import db_healthy

        ok = db_healthy()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"database unavailable: {e}")
    if not ok:
        raise HTTPException(status_code=503, detail="database unavailable")
    return {"status": "ready", "database": "ok"}


@router.get("/api/season-status")
def season_status():
    """
    Single source of truth for the frontend's "is this still demo/archived
    data" banners. Derived from get_gw_context, the same function every
    prediction endpoint's dynamic reference_date/next_event defaults use.
    """
    ctx = get_gw_context()
    return {
        "is_preseason": ctx["is_preseason"],
        "next_event": ctx["next_event"],
        # Real deadline from bootstrap events[], so the frontend countdown
        # doesn't have to guess one (and advances by itself each gameweek).
        "next_deadline": ctx["next_deadline"],
        "archive_season_label": "2025/26",
        "current_season_label": "2026/27",
    }
