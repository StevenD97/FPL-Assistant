"""
FastAPI backend for the FPL Assistant.

Run with (from the backend/ folder): venv\\Scripts\\python.exe -m uvicorn app.main:app --reload
Then visit http://127.0.0.1:8000/docs for interactive API docs.

NOTE ON DEMO DEFAULTS: reference_date/next_event/fixture_start_event default
to values inside last season (2025/26), since the 2026/27 fixtures aren't
published yet - see analysis.py and the other scripts in this folder for
the same caveat. Once the new season is live, update these defaults.
"""

import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from analysis import (
    FPL_API_BASE,
    build_chip_strategy,
    build_squad_analysis,
    compute_fixture_difficulty,
    compute_player_scores,
    ensure_data_fetched,
    fetch_entry_info,
    fetch_entry_picks,
    get_gw_context,
    load_bootstrap,
    load_fixtures,
    load_gw_history,
    map_archived_ids_to_live,
    nullable_int_column,
    top_differentials,
)
from optimizer import build_player_pool, optimize_best_squad, optimize_transfers
from team_model import (
    CROSS_SEASON_HALF_LIFE_DAYS,
    map_player_stats_to_roster,
    predict_multi_gw_breakdown,
    predict_multi_gw_points,
    predict_player_points,
    resolve_live_to_training_id,
)

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_data_fetched()
    yield


app = FastAPI(title="FPL Assistant API", lifespan=lifespan)

# Allowed frontend origins, comma-separated. Defaults to local dev; set
# ALLOWED_ORIGINS in the deployment environment to the real frontend URL(s).
allowed_origins = os.environ.get(
    "ALLOWED_ORIGINS", "http://localhost:3000,http://192.168.0.19:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

PLAYER_SCORE_COLUMNS = [
    "id", "web_name", "team_short", "position", "recommendation_score", "confidence_adjusted",
    "rotation_risk", "next_opponent", "opponent_multiplier", "form", "recency_weighted_form",
    "ep_next", "expected_minutes", "selected_by_percent",
    "expected_goal_involvements", "ict_index", "defensive_contribution_per_90",
    "set_piece_duty_score", "penalties_order", "penalties_missed",
]


@app.get("/api/health")
def health():
    """Liveness: the process is up. Used by the keep-alive ping."""
    return {"status": "ok"}


@app.get("/api/ready")
def ready():
    """Readiness: can we actually serve? Checks DB connectivity."""
    from db.session import db_healthy

    ok = db_healthy()
    if not ok:
        raise HTTPException(status_code=503, detail="database unavailable")
    return {"status": "ready", "database": "ok"}


@app.get("/api/season-status")
def season_status():
    """
    Single source of truth for the frontend's "is this still demo/archived
    data" banners (previously ~15 separate hardcoded strings across
    different pages, each guessing independently at the season boundary -
    see the README's season-transition notes). Derived from
    analysis.get_gw_context, the same function every prediction endpoint's
    dynamic reference_date/next_event defaults use, so this can never
    drift out of sync with what the rest of the API is actually doing.
    """
    ctx = get_gw_context()
    return {
        "is_preseason": ctx["is_preseason"],
        "next_event": ctx["next_event"],
        "archive_season_label": "2025/26",
        "current_season_label": "2026/27",
    }


@app.get("/api/fixtures/difficulty")
def fixture_difficulty(start_event: Optional[int] = None, window_size: int = 5):
    if start_event is None:
        start_event = get_gw_context()["next_event"]
    df = compute_fixture_difficulty(start_event, window_size)
    return df.sort_values("fixture_score", ascending=False).to_dict(orient="records")


@app.get("/api/players/scores")
def player_scores(
    reference_date: str = "2025-11-30",
    next_event: int = 10,
    max_ownership: Optional[float] = None,
    limit: int = 50,
):
    ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
    df = compute_player_scores(ref_date, next_event)
    if max_ownership is not None:
        df = top_differentials(df, max_ownership=max_ownership, top_n=limit)
    else:
        df = df.sort_values("recommendation_score", ascending=False).head(limit)
    df = df[PLAYER_SCORE_COLUMNS].copy()
    # `id` above is an archived-2025/26 element id (compute_player_scores'
    # default bootstrap) - add live_id so the frontend can link to
    # /players/{live_id} without mixing season id-spaces. None if this
    # player isn't in the live game anymore (see map_archived_ids_to_live).
    live_ids = map_archived_ids_to_live(df["id"].tolist(), load_bootstrap(ARCHIVED_BOOTSTRAP_FILE), load_bootstrap(LIVE_BOOTSTRAP_FILE))
    df["live_id"] = nullable_int_column(df["id"].map(live_ids))
    return df.to_dict(orient="records")


@app.get("/api/players/predicted-points")
def player_predicted_points(
    reference_date: str = "2025-11-30",
    next_event: int = 10,
    limit: int = 50,
):
    """
    A second, independent points estimate - see team_model.py. Predicts
    each side's expected goals from recency-weighted attack/defence
    strength (Dixon-Coles-style), then splits that across players by
    their historical share of their team's goals/assists. Not used by
    recommendation_score/api/players/scores; meant for comparing the two
    approaches.
    """
    ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
    df = predict_player_points(ref_date, next_event)
    return df.sort_values("predicted_points", ascending=False).head(limit).to_dict(orient="records")


@app.get("/api/players/predicted-points-outlook")
def player_predicted_points_outlook(
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
    limit: int = 50,
):
    """
    The headline metric, not /api/players/predicted-points: sums
    team_model.py's predicted_points over gw_count gameweeks starting at
    next_event (still using only data available before reference_date -
    not re-predicting week to week with hindsight). multi_gw_backtest.py
    found this explains meaningfully more of what actually happens than
    a single gameweek does (r^2 0.30 at 1 GW vs 0.49 at 5 GW) - most of
    the single-gameweek "miss" is real football variance that averages
    out over a run of fixtures, not a modeling gap. See README.

    Unlike /api/players/predicted-points (its archived-only sibling, kept
    that way deliberately for comparing the two independent modeling
    approaches - see that endpoint's docstring), this one drafts from the
    live 2026/27 roster while still training on the archived 2025/26
    season - same cross-season split as optimizer_best_squad/all_players/
    etc. `next_event` is therefore a *live*-season gameweek number; a
    caller can still pass an explicit reference_date to explore an earlier
    training cutoff (e.g. to reproduce a past prediction), which is why
    both stay Optional query params rather than hardcoded literals.
    """
    ref_date, next_event = _resolve_gw_params(reference_date, next_event)
    next_events = list(range(next_event, next_event + gw_count))
    df = predict_multi_gw_points(
        ref_date, next_events,
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )
    # `id` is already a live-2026/27 element id (roster_bootstrap_file
    # above), unlike its archived-only sibling - no archived->live remap
    # needed, but live_id is still included so the frontend's PlayerLink
    # doesn't need a separate code path from that sibling endpoint.
    df = df.sort_values("predicted_points", ascending=False).head(limit).copy()
    df["live_id"] = df["id"]
    return df.to_dict(orient="records")


ARCHIVED_BOOTSTRAP_FILE = "bootstrap_static_2025_26_final.json"
ARCHIVED_FIXTURES_FILE = "fixtures_2025_26_final.json"

# The live 2026/27 roster - players, teams, prices, fixtures - fetched by
# ensure_data_fetched() at startup (load_bootstrap/load_fixtures's own
# defaults). No 2026/27 gw_history exists yet (the season hasn't been
# played), so the model still *trains* on the archived 2025/26 season
# above; only *who the players are* comes from here. See
# predict_player_points' roster_bootstrap_file/roster_fixtures_file
# docstring in team_model.py for how the two get reconciled (team-id
# remapping by name) without mixing seasons' team-id spaces.
LIVE_BOOTSTRAP_FILE = "bootstrap_static.json"
LIVE_FIXTURES_FILE = "fixtures.json"


def _resolve_gw_params(reference_date: Optional[str], next_event: Optional[int]):
    """
    Resolves an endpoint's reference_date/next_event query params against
    the live gameweek context (see analysis.get_gw_context) when the caller
    doesn't pass them explicitly - a per-request dynamic default instead of
    a frozen calendar literal that goes stale every gameweek. A caller can
    still override either one via querystring (e.g. to reproduce a specific
    past prediction), which is why every endpoint below keeps these as
    Optional[...] = None rather than baking the default in directly.
    """
    ctx = get_gw_context()
    ref_date = datetime.strptime(reference_date, "%Y-%m-%d") if reference_date else ctx["reference_date"]
    event = next_event if next_event is not None else ctx["next_event"]
    return ref_date, event


@app.get("/api/optimizer/best-squad")
def optimizer_best_squad(
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
    budget: int = 1000,
):
    """
    The provably optimal 15-man squad (and starting XI + captain) under
    budget alone - see optimizer.py. Optimizes against
    predict_multi_gw_points(), not a single gameweek, for the same
    reason the Outlook page does: multi-week predictions track reality
    meaningfully better, and a squad is meant to hold for more than one
    week. budget is in £0.1m units (1000 = £100.0m, the standard start).

    Drafts from the live 2026/27 roster (roster_bootstrap_file/
    roster_fixtures_file) while still training on the archived 2025/26
    season, using CROSS_SEASON_HALF_LIFE_DAYS instead of the in-season
    default half_life_days=21 - see team_model.py for why (a flat 21-day
    half-life decays a ~90-day close season gap to near-zero signal).
    apply_live_signals=True since the live bootstrap is a genuinely
    current snapshot here (injury status, set-piece duties).
    """
    ref_date, next_event = _resolve_gw_params(reference_date, next_event)
    next_events = list(range(next_event, next_event + gw_count))
    bootstrap = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    predicted = predict_multi_gw_points(
        ref_date, next_events,
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )
    pool = build_player_pool(predicted, bootstrap)
    return optimize_best_squad(pool, budget=budget)


@app.get("/api/squad-builder/players")
def squad_builder_players(
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
):
    """
    The full player pool for the manual Squad Builder page: id, cost,
    predicted_points (multi-gameweek, same rationale as the optimizer
    endpoints above), position, team, set-piece duty order (penalties,
    direct free-kicks, corners/indirect free-kicks - for the "no
    taker" diagnostics), appearance_points (a 0-2-per-fixture proxy for
    how nailed a starting spot is - see _fixture_points in team_model.py;
    used for the rotation-risk diagnostic), value (points per £m),
    ownership %, and live availability status/news. Fetched once by the
    frontend and used to compute every draft diagnostic client-side as
    the user adds/removes players - no round trip per click.

    Uses predict_multi_gw_breakdown() rather than predict_multi_gw_points()
    specifically to get appearance_points - the same underlying model,
    just not collapsed down to predicted_points alone.

    Drafts from the live 2026/27 roster - see optimizer_best_squad's
    docstring above for the cross-season training/roster split.
    """
    ref_date, next_event = _resolve_gw_params(reference_date, next_event)
    next_events = list(range(next_event, next_event + gw_count))
    bootstrap = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    predicted = predict_multi_gw_breakdown(
        ref_date, next_events,
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )
    pool = build_player_pool(predicted, bootstrap)
    cols = [
        "id", "web_name", "team_short", "position", "now_cost", "predicted_points", "value",
        "selected_by_percent", "status", "news", "penalties_order", "direct_freekicks_order",
        "corners_and_indirect_freekicks_order", "appearance_points", "fixture_count", "fixture_ticker",
    ]
    df = pool[cols].rename(columns={"now_cost": "cost_raw"})
    df["cost"] = (df["cost_raw"] / 10).round(1)
    return df.drop(columns="cost_raw").sort_values("predicted_points", ascending=False).to_dict(orient="records")


@app.get("/api/squad-builder/fixtures")
def squad_builder_fixtures(next_event: Optional[int] = None, gw_count: int = 5):
    """
    Team-level fixture difficulty for the Squad Builder's diagnostics
    (tough-run / missing-strong-fixture-team checks) - pinned to the
    live 2026/27 fixtures/teams, matching squad_builder_players() above.
    FPL reassigns team ids every season (see optimizer.py's docstrings),
    so this must never mix a live-season team mapping with an
    archived-season player pool, or vice versa.
    """
    if next_event is None:
        next_event = get_gw_context()["next_event"]
    return compute_fixture_difficulty(
        next_event, gw_count, bootstrap_file=LIVE_BOOTSTRAP_FILE, fixtures_file=LIVE_FIXTURES_FILE,
    ).to_dict(orient="records")


def _not_found_detail(team_id, event):
    where = f"GW{event}" if isinstance(event, int) else event
    return (
        f"No picks found for team {team_id} at {where}. FPL appears to reset/purge "
        "manager pick history at each season boundary, so a gameweek that isn't this "
        "manager's most recent one may no longer be fetchable via the live API - see README."
    )


@app.get("/api/entry/{team_id}")
def entry_summary(team_id: int):
    """
    Lightweight public lookup of a manager's headline info (name, team name,
    overall rank, squad value, bank) for the "Connect your team" flow - just
    hits entry/{id}/, no squad analysis. Values come back in tenths of a
    million (last_deadline_value=1004 -> £100.4m). FPL 404s (unknown or
    season-purged id) are converted to HTTPException so the response keeps its
    CORS headers and the frontend can show a real message - see
    squad_analysis's docstring for why a raw error wouldn't.
    """
    try:
        info = fetch_entry_info(team_id)
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

    value = info.get("last_deadline_value")
    bank = info.get("last_deadline_bank")
    name = f"{info.get('player_first_name') or ''} {info.get('player_last_name') or ''}".strip()
    return {
        "id": info.get("id", team_id),
        "player_name": name or None,
        "team_name": info.get("name"),
        "overall_rank": info.get("summary_overall_rank"),
        "overall_points": info.get("summary_overall_points"),
        "team_value": round(value / 10, 1) if isinstance(value, (int, float)) else None,
        "bank": round(bank / 10, 1) if isinstance(bank, (int, float)) else None,
        "gameweek": info.get("current_event"),
    }


@app.get("/api/squad/{team_id}")
def squad_analysis(
    team_id: int,
    event: Optional[int] = None,
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    fixture_start_event: Optional[int] = None,
    window_size: int = 5,
):
    """
    event=None (the default) fetches this manager's own most recently
    scored gameweek (FPL's current_event on their entry, resolved inside
    build_squad_analysis) rather than a fixed gameweek number - a manager's
    picks for any *other* gameweek may not be fetchable at all (FPL appears
    to purge/reset pick history at each season boundary), and a hardcoded
    default drifts wrong the moment a new season starts. reference_date/
    next_event default to the live gameweek context (see
    analysis.get_gw_context) for the same reason; fixture_start_event
    follows next_event unless given separately.

    Note: fetch_entry_info/fetch_entry_picks (called deep inside
    build_squad_analysis) raise a raw requests.HTTPError on a 404 from
    FPL's API - very common right now given the season-boundary reset
    above. Left unhandled, that becomes a 500 with NO CORS headers
    (confirmed directly against the deployed backend: Starlette's
    ServerErrorMiddleware, which catches genuinely unhandled exceptions,
    sits *outside* CORSMiddleware, so error responses it generates never
    get Access-Control-Allow-Origin - only exceptions FastAPI itself
    handles, like HTTPException, flow back through CORSMiddleware
    correctly). The browser then reports a bare, unreadable "Failed to
    fetch" instead of surfacing any real error message - this is why
    that message doesn't explain itself. Converting to HTTPException
    here fixes both problems: a proper CORS-correct response, and an
    explanation the frontend can actually show.
    """
    ref_date, next_event = _resolve_gw_params(reference_date, next_event)
    if fixture_start_event is None:
        fixture_start_event = next_event
    try:
        return build_squad_analysis(team_id, event, ref_date, next_event, fixture_start_event, window_size)
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else 502
        if status == 404:
            raise HTTPException(status_code=404, detail=_not_found_detail(team_id, event or "their current gameweek"))
        raise HTTPException(status_code=502, detail=f"FPL API error: {e}")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/squad/{team_id}/chips")
def chip_strategy(team_id: int, scan_start_event: int = 24, scan_end_event: int = 37):
    """
    See squad_analysis's docstring for why FPL API errors are caught and
    converted here. build_chip_strategy fetches this manager's picks for
    their own current_event (falling back to scan_start_event - 1 only if
    FPL hasn't scored them for anything yet), so the exact gameweek isn't
    known here in advance - the error message below deliberately doesn't
    guess at one.
    """
    try:
        return build_chip_strategy(team_id, scan_start_event, scan_end_event)
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else 502
        if status == 404:
            raise HTTPException(status_code=404, detail=_not_found_detail(team_id, "their most recent gameweek"))
        raise HTTPException(status_code=502, detail=f"FPL API error: {e}")


@app.get("/api/squad/{team_id}/optimize-transfers")
def squad_optimize_transfers(
    team_id: int,
    event: Optional[int] = None,
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
    free_transfers: int = 1,
    max_transfers: Optional[int] = None,
):
    """
    Fetches this manager's real squad (picks + bank) for `event`, then
    finds the provably optimal set of transfers - see optimizer.py.
    event=None (the default) uses this manager's own current_event (FPL's
    own record of the last gameweek they were scored for), same source of
    truth squad_analysis uses - a fixed gameweek number goes stale the
    moment a new season starts, and FPL appears to reset/purge manager
    pick history at each season boundary, so any *other* gameweek may not
    be fetchable at all. Before 2026/27 GW1 locks, no team_id has a
    fetchable squad yet, so this 404s with a clear message rather than
    guessing at a default.

    The buy/sell pool itself draws from the live 2026/27 roster, same as
    optimizer_best_squad/squad_builder_players above - see those
    docstrings for the cross-season training/roster split.

    See squad_analysis's docstring for why fetch_entry_picks' FPL API
    errors are caught and converted to HTTPException here rather than
    left to propagate as an unhandled exception.
    """
    ref_date, next_event = _resolve_gw_params(reference_date, next_event)
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
            raise HTTPException(status_code=404, detail=_not_found_detail(team_id, event))
        raise HTTPException(status_code=502, detail=f"FPL API error: {e}")
    current_squad_ids = [pick["element"] for pick in picks_data["picks"]]
    bank = picks_data["entry_history"]["bank"]

    next_events = list(range(next_event, next_event + gw_count))
    bootstrap = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    predicted = predict_multi_gw_points(
        ref_date, next_events,
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )
    pool = build_player_pool(predicted, bootstrap)
    return optimize_transfers(pool, current_squad_ids, bank=bank, free_transfers=free_transfers, max_transfers=max_transfers)


# Archived-season (2025/26) totals shown on the All Players / player-detail
# pages alongside live identity/price - the live bootstrap's own totals are
# still pre-season zeros (see the live/archived split documented above).
SEASON_STAT_FIELDS = [
    "total_points", "goals_scored", "assists", "clean_sheets", "goals_conceded",
    "saves", "bonus", "minutes", "starts", "yellow_cards", "red_cards",
    "expected_goals", "expected_assists", "expected_goal_involvements", "ict_index",
]


def _season_stats_by_live_id():
    """training-season (archived) totals, remapped to live element ids by code."""
    archived = load_bootstrap(ARCHIVED_BOOTSTRAP_FILE)
    live = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    stats_by_training_id = {p["id"]: {f: p.get(f) for f in SEASON_STAT_FIELDS} for p in archived["elements"]}
    return map_player_stats_to_roster(stats_by_training_id, archived["elements"], live["elements"])


@app.get("/api/players")
def all_players(
    search: Optional[str] = None,
    position: Optional[str] = None,
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
    limit: int = 600,
):
    """
    Every player in the live 2026/27 game: identity/price/ownership/status
    plus predicted_points (same cross-season training/roster split as the
    optimizer endpoints) and last season's (2025/26) real season totals for
    context, where available (see SEASON_STAT_FIELDS/_season_stats_by_live_id -
    None for players with no top-flight record in the archive). Backs the
    All Players browser page.
    """
    ref_date, next_event = _resolve_gw_params(reference_date, next_event)
    next_events = list(range(next_event, next_event + gw_count))
    bootstrap = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    predicted = predict_multi_gw_points(
        ref_date, next_events,
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )
    pool = build_player_pool(predicted, bootstrap)

    if position:
        pool = pool[pool["position"] == position]
    if search:
        q = search.lower()
        pool = pool[pool["web_name"].str.lower().str.contains(q) | pool["team_short"].str.lower().str.contains(q)]

    season_stats = _season_stats_by_live_id()
    cols = [
        "id", "web_name", "team_short", "position", "now_cost", "predicted_points", "value",
        "selected_by_percent", "status", "news",
    ]
    df = pool[cols].rename(columns={"now_cost": "cost_raw"}).copy()
    df["cost"] = (df["cost_raw"] / 10).round(1)
    records = df.drop(columns="cost_raw").sort_values("predicted_points", ascending=False).head(limit).to_dict(orient="records")
    for row in records:
        row["season_stats"] = season_stats.get(row["id"])
    return records


@app.get("/api/players/{player_id}")
def player_detail(
    player_id: int,
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
):
    """
    Single-player detail for the player page: live identity/price/
    ownership/status, this season's real per-gameweek history (from the
    2025/26 gw_history archive, if this player has a match there - see
    resolve_live_to_training_id), and the model's predicted-points
    breakdown by category (goals/assists/clean sheets/bonus/etc, not just
    the total) for the next gw_count gameweeks.
    """
    ref_date, next_event = _resolve_gw_params(reference_date, next_event)
    next_events = list(range(next_event, next_event + gw_count))

    live = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    live_player = next((p for p in live["elements"] if p["id"] == player_id), None)
    if live_player is None:
        raise HTTPException(status_code=404, detail=f"No player with id {player_id} in the live 2026/27 roster")

    teams_by_id = {t["id"]: t for t in live["teams"]}
    positions_by_id = {p["id"]: p["singular_name_short"] for p in live["element_types"]}

    archived = load_bootstrap(ARCHIVED_BOOTSTRAP_FILE)
    training_id = resolve_live_to_training_id(player_id, live["elements"], archived["elements"])

    season_stats = None
    gw_history = []
    if training_id is not None:
        archived_player = next(p for p in archived["elements"] if p["id"] == training_id)
        season_stats = {f: archived_player.get(f) for f in SEASON_STAT_FIELDS}
        history = load_gw_history("2025_26")
        rows = history[history["element"] == training_id].sort_values("GW")
        gw_history = rows[["GW", "total_points", "minutes", "goals_scored", "assists", "bonus"]].to_dict(orient="records")

    breakdown = predict_multi_gw_breakdown(
        ref_date, next_events,
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )
    prediction = breakdown[breakdown["id"] == player_id].to_dict(orient="records")

    return {
        "id": player_id,
        "web_name": live_player["web_name"],
        "first_name": live_player["first_name"],
        "second_name": live_player["second_name"],
        "team_short": teams_by_id[live_player["team"]]["short_name"],
        "team_name": teams_by_id[live_player["team"]]["name"],
        "position": positions_by_id[live_player["element_type"]],
        "cost": round(live_player["now_cost"] / 10, 1),
        "selected_by_percent": float(live_player["selected_by_percent"]),
        "status": live_player["status"],
        "news": live_player["news"],
        "penalties_order": live_player.get("penalties_order") or 0,
        "season_stats": season_stats,
        "gw_history": gw_history,
        "prediction": prediction[0] if prediction else None,
    }


@app.get("/api/players/{player_id}/alternatives")
def player_alternatives(
    player_id: int,
    exclude: Optional[str] = None,
    limit: int = 5,
    reference_date: Optional[str] = None,
    next_event: Optional[int] = None,
    gw_count: int = 5,
):
    """
    The top `limit` same-position players by predicted_points, excluding
    this player and anything in `exclude` (comma-separated ids - e.g. the
    rest of the manager's current squad, so a suggested transfer target
    isn't already owned). Backs the "suggest replacements" action on a
    player row in My Squad / Squad Builder.
    """
    ref_date, next_event = _resolve_gw_params(reference_date, next_event)
    next_events = list(range(next_event, next_event + gw_count))
    bootstrap = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    predicted = predict_multi_gw_points(
        ref_date, next_events,
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )
    pool = build_player_pool(predicted, bootstrap)

    target = pool[pool["id"] == player_id]
    if target.empty:
        raise HTTPException(status_code=404, detail=f"No player with id {player_id} in the live 2026/27 roster")
    position = target.iloc[0]["position"]

    excluded_ids = {player_id}
    if exclude:
        excluded_ids |= {int(x) for x in exclude.split(",") if x.strip()}

    candidates = pool[(pool["position"] == position) & (~pool["id"].isin(excluded_ids))]
    cols = ["id", "web_name", "team_short", "position", "now_cost", "predicted_points", "value", "selected_by_percent"]
    df = candidates[cols].rename(columns={"now_cost": "cost_raw"}).copy()
    df["cost"] = (df["cost_raw"] / 10).round(1)
    return df.drop(columns="cost_raw").sort_values("predicted_points", ascending=False).head(limit).to_dict(orient="records")


@app.get("/api/fixtures/schedule")
def fixtures_schedule(season: str = "live"):
    """
    The full season's fixture list (all events, not just a difficulty
    window), with kickoff time and result if played - backs the Schedule
    & Results page. season="live" (default) uses the live 2026/27
    calendar; season="archive" uses the archived 2025/26 files, for
    looking back at last season's results. Deliberately "live"/"archive"
    rather than a season number here - every other season-string literal
    in this app is the archived season's own token (see ARCHIVED_SEASON),
    which would need updating every year; this one param never does.
    """
    if season == "archive":
        bootstrap_file, fixtures_file = ARCHIVED_BOOTSTRAP_FILE, ARCHIVED_FIXTURES_FILE
    else:
        bootstrap_file, fixtures_file = LIVE_BOOTSTRAP_FILE, LIVE_FIXTURES_FILE

    bootstrap = load_bootstrap(bootstrap_file)
    fixtures = load_fixtures(fixtures_file)
    teams = {t["id"]: t["short_name"] for t in bootstrap["teams"]}

    rows = []
    for fx in fixtures:
        if fx.get("event") is None:
            continue
        rows.append({
            "event": fx["event"],
            "kickoff_time": fx["kickoff_time"],
            "finished": fx["finished"],
            "team_h": teams[fx["team_h"]],
            "team_a": teams[fx["team_a"]],
            "team_h_score": fx["team_h_score"],
            "team_a_score": fx["team_a_score"],
            "team_h_difficulty": fx["team_h_difficulty"],
            "team_a_difficulty": fx["team_a_difficulty"],
        })
    rows.sort(key=lambda r: (r["event"], r["kickoff_time"]))
    return rows


LEAGUE_STANDINGS_ENTRY_CAP = 20


@app.get("/api/leagues/{team_id}")
def manager_leagues(team_id: int):
    """This manager's classic (non-H2H) leagues - id/name/rank - for the Leagues page's league picker."""
    response = requests.get(f"{FPL_API_BASE}/entry/{team_id}/", timeout=30)
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail=f"No FPL manager with team id {team_id}")
    response.raise_for_status()
    entry = response.json()
    return [
        {"id": lg["id"], "name": lg["name"], "entry_rank": lg["entry_rank"]}
        for lg in entry["leagues"]["classic"]
    ]


@app.get("/api/leagues/{league_id}/standings")
def league_standings(league_id: int, max_entries: int = LEAGUE_STANDINGS_ENTRY_CAP):
    """
    Standings for a classic league, plus each shown manager's gameweek-by-
    gameweek total-points trend for the current season (for the Leagues
    page's line chart). Capped at max_entries managers (ranked by current
    standing) since each one needs its own live API call for history -
    unbounded would mean hundreds of requests for a large public league.

    Honest limitation: FPL only keeps gameweek-by-gameweek scores for the
    *current* season - once 2026/27 has actual gameweeks played, this
    fills in; before then (and for any season once it's over, like
    2025/26 now), standings/history are empty or season-aggregate only.
    See README.
    """
    response = requests.get(f"{FPL_API_BASE}/leagues-classic/{league_id}/standings/", timeout=30)
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail=f"No classic league with id {league_id}")
    response.raise_for_status()
    data = response.json()
    results = data["standings"]["results"][:max_entries]

    trend_entries = []
    for row in results:
        hist_response = requests.get(f"{FPL_API_BASE}/entry/{row['entry']}/history/", timeout=30)
        hist_response.raise_for_status()
        current = hist_response.json()["current"]
        trend_entries.append({
            "entry_id": row["entry"],
            "player_name": row["player_name"],
            "entry_name": row["entry_name"],
            "series": [{"event": gw["event"], "total_points": gw["total_points"]} for gw in current],
        })

    return {
        "league_name": data["league"]["name"],
        "standings": [
            {
                "entry_id": r["entry"], "player_name": r["player_name"], "entry_name": r["entry_name"],
                "rank": r["rank"], "last_rank": r["last_rank"], "total": r["total"], "event_total": r["event_total"],
            }
            for r in results
        ],
        "trend": trend_entries,
    }
