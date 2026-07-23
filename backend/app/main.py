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
    fetch_entry_picks,
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
    return {"status": "ok"}


@app.get("/api/fixtures/difficulty")
def fixture_difficulty(start_event: int = 10, window_size: int = 5):
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
    reference_date: str = "2025-11-30",
    next_event: int = 10,
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
    """
    ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
    next_events = list(range(next_event, next_event + gw_count))
    df = predict_multi_gw_points(ref_date, next_events)
    df = df.sort_values("predicted_points", ascending=False).head(limit).copy()
    # `id` above is an archived-2025/26 element id (predict_multi_gw_points'
    # default bootstrap) - add live_id so the frontend can link to
    # /players/{live_id} without mixing season id-spaces.
    live_ids = map_archived_ids_to_live(df["id"].tolist(), load_bootstrap(ARCHIVED_BOOTSTRAP_FILE), load_bootstrap(LIVE_BOOTSTRAP_FILE))
    df["live_id"] = nullable_int_column(df["id"].map(live_ids))
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
# 2026/27 GW1 kicks off 2026-08-21 - the day before, so all of 2025/26's
# archive is in scope and nothing "in the future" leaks in.
SEASON_START_REFERENCE_DATE = "2026-08-20"


@app.get("/api/optimizer/best-squad")
def optimizer_best_squad(
    reference_date: str = SEASON_START_REFERENCE_DATE,
    next_event: int = 1,
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
    ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
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
    reference_date: str = SEASON_START_REFERENCE_DATE,
    next_event: int = 1,
    gw_count: int = 5,
):
    """
    The full player pool for the manual Squad Builder page: id, cost,
    predicted_points (multi-gameweek, same rationale as the optimizer
    endpoints above), position, team, penalties_order (for the "no
    penalty taker" diagnostic), value (points per £m), ownership %, and
    live availability status/news. Fetched once by the frontend and used
    to compute every draft diagnostic client-side as the user
    adds/removes players - no round trip per click.

    Drafts from the live 2026/27 roster - see optimizer_best_squad's
    docstring above for the cross-season training/roster split.
    """
    ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
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
    cols = [
        "id", "web_name", "team_short", "position", "now_cost", "predicted_points", "value",
        "selected_by_percent", "status", "news", "penalties_order", "fixture_ticker",
    ]
    df = pool[cols].rename(columns={"now_cost": "cost_raw"})
    df["cost"] = (df["cost_raw"] / 10).round(1)
    return df.drop(columns="cost_raw").sort_values("predicted_points", ascending=False).to_dict(orient="records")


@app.get("/api/squad-builder/fixtures")
def squad_builder_fixtures(next_event: int = 1, gw_count: int = 5):
    """
    Team-level fixture difficulty for the Squad Builder's diagnostics
    (tough-run / missing-strong-fixture-team checks) - pinned to the
    live 2026/27 fixtures/teams, matching squad_builder_players() above.
    FPL reassigns team ids every season (see optimizer.py's docstrings),
    so this must never mix a live-season team mapping with an
    archived-season player pool, or vice versa.
    """
    return compute_fixture_difficulty(
        next_event, gw_count, bootstrap_file=LIVE_BOOTSTRAP_FILE, fixtures_file=LIVE_FIXTURES_FILE,
    ).to_dict(orient="records")


@app.get("/api/squad/{team_id}")
def squad_analysis(
    team_id: int,
    event: int = 38,
    reference_date: str = "2025-11-30",
    next_event: int = 10,
    fixture_start_event: int = 10,
    window_size: int = 5,
):
    ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
    return build_squad_analysis(team_id, event, ref_date, next_event, fixture_start_event, window_size)


@app.get("/api/squad/{team_id}/chips")
def chip_strategy(team_id: int, scan_start_event: int = 24, scan_end_event: int = 37):
    return build_chip_strategy(team_id, scan_start_event, scan_end_event)


@app.get("/api/squad/{team_id}/optimize-transfers")
def squad_optimize_transfers(
    team_id: int,
    event: int = 1,
    reference_date: str = SEASON_START_REFERENCE_DATE,
    next_event: int = 1,
    gw_count: int = 5,
    free_transfers: int = 1,
    max_transfers: Optional[int] = None,
):
    """
    Fetches this manager's real squad (picks + bank) for `event`, then
    finds the provably optimal set of transfers - see optimizer.py.
    Note: FPL appears to reset/purge manager pick history at each
    season boundary (confirmed directly - a real, previously-used team
    id returned "No Entry matches" once 2026/27's calendar went live),
    so `event` needs to be a 2026/27 gameweek this manager's picks
    already exist for - i.e. after that gameweek's deadline has passed.
    Before 2026/27 GW1 locks, no team_id has a fetchable squad yet.

    The buy/sell pool itself draws from the live 2026/27 roster, same as
    optimizer_best_squad/squad_builder_players above - see those
    docstrings for the cross-season training/roster split.
    """
    ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
    picks_data = fetch_entry_picks(team_id, event)
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
    reference_date: str = SEASON_START_REFERENCE_DATE,
    next_event: int = 1,
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
    ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
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
    reference_date: str = SEASON_START_REFERENCE_DATE,
    next_event: int = 1,
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
    ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
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
    reference_date: str = SEASON_START_REFERENCE_DATE,
    next_event: int = 1,
    gw_count: int = 5,
):
    """
    The top `limit` same-position players by predicted_points, excluding
    this player and anything in `exclude` (comma-separated ids - e.g. the
    rest of the manager's current squad, so a suggested transfer target
    isn't already owned). Backs the "suggest replacements" action on a
    player row in My Squad / Squad Builder.
    """
    ref_date = datetime.strptime(reference_date, "%Y-%m-%d")
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
    calendar; season="2025-26" uses the archived files, for looking back
    at last season's results.
    """
    if season == "2025-26":
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
