"""Liveness / readiness / data-freshness / season-context endpoints."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from fpl.config import LIVE_BOOTSTRAP_FILE
from fpl.domain.gameweek import get_gw_context

router = APIRouter()

# A deadline that has already passed means the snapshot predates a gameweek
# that has since begun - the data is behind the real season, whatever its age.
# The hour of slack keeps a deadline that passed minutes ago from flapping.
_DEADLINE_GRACE_HOURS = 1
# The ingest runs hourly; a snapshot older than this means it has been failing.
_STALE_AFTER_HOURS = 24


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


@router.get("/api/data-status")
def data_status():
    """
    Where the data being served comes from, and whether it is current.

    This exists because of a silent failure that lasted weeks: the database
    went away, ``allow_file_fallback`` did its job, and the site carried on
    serving the committed snapshot - which was a pre-season one. Every
    endpoint returned 200 and /api/health said "ok" while the site told
    visitors the season had not started. Liveness was never the question;
    freshness was, and nothing reported it.

    ``stale`` is the field to alert on. It is driven mainly by the data's own
    view of the calendar rather than by a timestamp: if the next deadline it
    knows about is already in the past, the snapshot predates a gameweek that
    has since started, which is true whether it is being served from the
    database or from disk. Snapshot age is the secondary signal and is only
    available on the database path - a file's mtime is its checkout time, not
    its data time, so it would be worse than no answer at all.
    """
    fetched_at = None
    source = "files"
    rejected_snapshot = False
    try:
        from fpl.data.db.read import latest_snapshot_health

        fetched_at, usable = latest_snapshot_health(LIVE_BOOTSTRAP_FILE)
        if fetched_at is not None:
            # A stored row is only the source if the loaders would actually
            # serve it; a malformed one is rejected and disk wins instead.
            source = "database" if usable else "files"
            rejected_snapshot = not usable
    except Exception:
        # Unreachable database is not an error here - it is the answer, and
        # the file fallback below is what the app is serving.
        pass

    now = datetime.now(timezone.utc)
    age_hours = None
    if fetched_at is not None:
        if fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=timezone.utc)
        age_hours = round((now - fetched_at).total_seconds() / 3600, 1)

    ctx = get_gw_context()
    deadline = ctx["next_deadline"]
    deadline_passed = False
    if deadline:
        parsed = datetime.fromisoformat(str(deadline).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        deadline_passed = (now - parsed).total_seconds() > _DEADLINE_GRACE_HOURS * 3600

    reasons = []
    if deadline_passed:
        reasons.append(f"next deadline {deadline} is in the past")
    if age_hours is not None and age_hours > _STALE_AFTER_HOURS:
        reasons.append(f"newest snapshot is {age_hours}h old")
    if rejected_snapshot:
        reasons.append("stored snapshot is malformed; serving the on-disk fallback")

    return {
        "source": source,
        "snapshot_fetched_at": fetched_at.isoformat() if fetched_at else None,
        "snapshot_age_hours": age_hours,
        "next_event": ctx["next_event"],
        "next_deadline": deadline,
        "stale": bool(reasons),
        "reasons": reasons,
    }


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


@router.get("/api/accuracy")
def accuracy():
    """
    How the model has actually done, gameweek by gameweek.

    Public and unfiltered on purpose: a prediction nobody ever checks is a
    number a reader has to take on faith. Grades are cached (see
    fpl.services.accuracy), so this is cheap after the first call following a
    finished gameweek.
    """
    from fpl.services.accuracy import accuracy_report

    return accuracy_report()


@router.get("/api/accuracy/season-run")
def season_run():
    """
    The model's own season, played by the game's rules.

    The other half of the record. /api/accuracy answers "were the projections
    well ranked"; this answers the question a manager actually has, which is
    what following them would have scored - built to a GBP100.0m budget, one
    free transfer a week, hits charged, auto-substitutions applied, and the
    total looked up in the game's Overall table for a real rank.

    Served from the file the refresh workflow commits after each gameweek (see
    tools/build_season_run.py). Replaying on demand would mean an integer
    program per gameweek and a binary search through ten million league
    entries, so a missing file returns an empty record rather than building
    one - the panel disappears, the page does not hang.
    """
    from fpl.services.season_run import load_run

    run = load_run()
    if run is None:
        return {"gameweeks": [], "summary": None, "available": False}
    return {**run, "available": True}
