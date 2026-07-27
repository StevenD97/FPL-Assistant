"""
Player-facing orchestration: the recommendation-score list, both prediction
endpoints, the full-roster browser, single-player detail, replacement
suggestions, per-gameweek trajectories, and the price-change watch. Each takes
already-resolved arguments (the router owns query-param parsing / gameweek
resolution) and returns plain dict/list JSON structures.
"""
from fpl.config import (
    ARCHIVED_BOOTSTRAP_FILE,
    ARCHIVED_FIXTURES_FILE,
    LIVE_BOOTSTRAP_FILE,
    LIVE_FIXTURES_FILE,
)
from fpl.data.loaders import (
    load_bootstrap,
    load_fixtures,
    load_gw_history,
    load_recent_bootstrap_snapshots,
)
from fpl.domain.fixtures import build_fixtures_by_team_event
from fpl.domain.media import (
    player_photo_url,
    team_badge_by_short_name,
    team_badge_url,
    team_kit_url,
)
from fpl.domain.price import MIN_NET_TRANSFERS_TO_FLAG, compute_price_change_signals
from fpl.domain.scoring import (
    compute_player_scores,
    map_archived_ids_to_live,
    nullable_int_column,
    top_differentials,
)
from fpl.model.ids import map_player_stats_to_roster, resolve_live_to_training_id
from fpl.model.predict import predict_multi_gw_breakdown, predict_multi_gw_points, predict_player_points
from fpl.model.rules import CROSS_SEASON_HALF_LIFE_DAYS
from fpl.optimize.squad import build_player_pool

PLAYER_SCORE_COLUMNS = [
    "id", "web_name", "team_short", "position", "recommendation_score", "confidence_adjusted",
    "rotation_risk", "next_opponent", "opponent_multiplier", "form", "recency_weighted_form",
    "ep_next", "expected_minutes", "selected_by_percent",
    "expected_goal_involvements", "ict_index", "defensive_contribution_per_90",
    "set_piece_duty_score", "penalties_order", "penalties_missed",
]

# Archived-season (2025/26) totals shown on the All Players / player-detail
# pages alongside live identity/price - the live bootstrap's own totals are
# still pre-season zeros (see the live/archived split in the README).
SEASON_STAT_FIELDS = [
    "total_points", "goals_scored", "assists", "clean_sheets", "goals_conceded",
    "saves", "bonus", "minutes", "starts", "yellow_cards", "red_cards",
    "expected_goals", "expected_assists", "expected_goal_involvements", "ict_index",
]

# appearance_points/fixture (0-2 scale, see _fixture_points in fpl.model.predict)
# below this in a given gameweek flags as a rotation-risk week in the planner -
# mirrors squad-builder's own ROTATION_RISK_THRESHOLD constant
# (frontend/src/app/squad-builder/page.tsx) so the two pages agree on what
# "risky" means, even though they can't literally share a constant across the
# language boundary.
PLANNER_ROTATION_RISK_THRESHOLD = 1.3
PLANNER_TOUGH_FIXTURE_FDR = 4  # FPL's own 1(easiest)-5(hardest) fixture difficulty rating
PLANNER_DIP_RATIO = 0.6  # flag a gameweek at <60% of this player's own average across the window


def season_stats_by_live_id():
    """training-season (archived) totals, remapped to live element ids by code."""
    archived = load_bootstrap(ARCHIVED_BOOTSTRAP_FILE)
    live = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    stats_by_training_id = {p["id"]: {f: p.get(f) for f in SEASON_STAT_FIELDS} for p in archived["elements"]}
    return map_player_stats_to_roster(stats_by_training_id, archived["elements"], live["elements"])


def player_scores(ref_date, next_event, max_ownership=None, limit=50):
    df = compute_player_scores(ref_date, next_event)
    # recommendation_score stays pinned to the archived season (see
    # compute_player_scores' docstring), but ownership is a live, currently-
    # changing number - showing last season's final selected_by_percent here
    # would be stale and, worse, wrong for what "differential" means right
    # now. Overlay live selected_by_percent (matched by the stable `code`
    # field, same as map_archived_ids_to_live) before filtering/ranking, so
    # both the max_ownership cutoff and the displayed % reflect this season's
    # actual picks-so-far. Falls back to the archived value for a player with
    # no live match (retired, or left the Premier League).
    live_ownership_by_code = {
        p["code"]: float(p["selected_by_percent"]) for p in load_bootstrap(LIVE_BOOTSTRAP_FILE)["elements"]
    }
    df["selected_by_percent"] = df["code"].map(live_ownership_by_code).fillna(df["selected_by_percent"])
    if max_ownership is not None:
        df = top_differentials(df, max_ownership=max_ownership, top_n=limit)
    else:
        df = df.sort_values("recommendation_score", ascending=False).head(limit)
    team_code_by_id = {t["id"]: t["code"] for t in load_bootstrap(ARCHIVED_BOOTSTRAP_FILE)["teams"]}
    df = df.copy()
    df["team_badge"] = df["team"].map(team_code_by_id).apply(team_badge_url)
    df = df[PLAYER_SCORE_COLUMNS + ["team_badge"]].copy()
    # `id` above is an archived-2025/26 element id (compute_player_scores'
    # default bootstrap) - add live_id so the frontend can link to
    # /players/{live_id} without mixing season id-spaces. None if this player
    # isn't in the live game anymore (see map_archived_ids_to_live).
    live_ids = map_archived_ids_to_live(df["id"].tolist(), load_bootstrap(ARCHIVED_BOOTSTRAP_FILE), load_bootstrap(LIVE_BOOTSTRAP_FILE))
    df["live_id"] = nullable_int_column(df["id"].map(live_ids))
    return df.to_dict(orient="records")


def predicted_points(ref_date, next_event, limit=50):
    df = predict_player_points(ref_date, next_event)
    return df.sort_values("predicted_points", ascending=False).head(limit).to_dict(orient="records")


def predicted_points_outlook(ref_date, next_event, gw_count=5, limit=50):
    next_events = list(range(next_event, next_event + gw_count))
    df = predict_multi_gw_points(
        ref_date, next_events,
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )
    # `id` is already a live-2026/27 element id (roster_bootstrap_file above),
    # unlike its archived-only sibling - no archived->live remap needed, but
    # live_id is still included so the frontend's PlayerLink doesn't need a
    # separate code path from that sibling endpoint.
    df = df.sort_values("predicted_points", ascending=False).head(limit).copy()
    df["live_id"] = df["id"]
    bootstrap = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    team_badges = team_badge_by_short_name(bootstrap)
    df["team_badge"] = df["team_short"].map(team_badges)

    # Structured, badge-ready form of fixture_ticker (a plain "HUL(A) | IPS(H)"
    # string) - for UIs that want a badge per fixture instead of parsing it.
    team_short_lookup = {t["id"]: t["short_name"] for t in bootstrap["teams"]}
    team_id_by_player_id = {e["id"]: e["team"] for e in bootstrap["elements"]}
    fixtures_by_team_event = build_fixtures_by_team_event(load_fixtures(LIVE_FIXTURES_FILE))

    def structured_fixtures(player_id):
        team_id = team_id_by_player_id.get(player_id)
        if team_id is None:
            return []
        result = []
        for event in next_events:
            for fx in fixtures_by_team_event[team_id].get(event, []):
                opponent = team_short_lookup[fx["opponent"]]
                result.append({"opponent": opponent, "is_home": fx["is_home"], "opponent_badge": team_badges[opponent]})
        return result

    df["fixtures"] = df["id"].apply(structured_fixtures)
    return df.to_dict(orient="records")


def all_players(search, position, ref_date, next_event, gw_count=5, limit=600):
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
    team_code_by_id = {t["id"]: t["code"] for t in bootstrap["teams"]}
    pool = pool.copy()
    pool["team_badge"] = pool["team"].map(team_code_by_id).apply(team_badge_url)

    if position:
        pool = pool[pool["position"] == position]
    if search:
        q = search.lower()
        pool = pool[pool["web_name"].str.lower().str.contains(q) | pool["team_short"].str.lower().str.contains(q)]

    season_stats = season_stats_by_live_id()
    cols = [
        "id", "web_name", "team_short", "position", "now_cost", "predicted_points", "value",
        "selected_by_percent", "status", "news", "team_badge",
    ]
    df = pool[cols].rename(columns={"now_cost": "cost_raw"}).copy()
    df["cost"] = (df["cost_raw"] / 10).round(1)
    records = df.drop(columns="cost_raw").sort_values("predicted_points", ascending=False).head(limit).to_dict(orient="records")
    for row in records:
        row["season_stats"] = season_stats.get(row["id"])
    return records


def player_detail(player_id, ref_date, next_event, gw_count=5):
    next_events = list(range(next_event, next_event + gw_count))

    live = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    live_player = next((p for p in live["elements"] if p["id"] == player_id), None)
    if live_player is None:
        raise ValueError(f"No player with id {player_id} in the live 2026/27 roster")

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

    team = teams_by_id[live_player["team"]]
    return {
        "id": player_id,
        "web_name": live_player["web_name"],
        "first_name": live_player["first_name"],
        "second_name": live_player["second_name"],
        "team_short": team["short_name"],
        "team_name": team["name"],
        "position": positions_by_id[live_player["element_type"]],
        "cost": round(live_player["now_cost"] / 10, 1),
        "selected_by_percent": float(live_player["selected_by_percent"]),
        "status": live_player["status"],
        "news": live_player["news"],
        "penalties_order": live_player.get("penalties_order") or 0,
        "team_badge": team_badge_url(team["code"]),
        "team_kit": team_kit_url(team["code"]),
        "player_photo": player_photo_url(live_player["code"]),
        "season_stats": season_stats,
        "gw_history": gw_history,
        "prediction": prediction[0] if prediction else None,
    }


def player_alternatives(player_id, exclude, limit, ref_date, next_event, gw_count=5):
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
        raise ValueError(f"No player with id {player_id} in the live 2026/27 roster")
    position = target.iloc[0]["position"]

    excluded_ids = {player_id}
    if exclude:
        excluded_ids |= {int(x) for x in exclude.split(",") if x.strip()}

    candidates = pool[(pool["position"] == position) & (~pool["id"].isin(excluded_ids))]
    cols = ["id", "web_name", "team_short", "position", "now_cost", "predicted_points", "value", "selected_by_percent"]
    df = candidates[cols].rename(columns={"now_cost": "cost_raw"}).copy()
    df["cost"] = (df["cost_raw"] / 10).round(1)
    return df.drop(columns="cost_raw").sort_values("predicted_points", ascending=False).head(limit).to_dict(orient="records")


def build_trajectory_context(ref_date, next_events):
    """
    Shared setup for per-player, per-gameweek trajectories - used by both
    squad_planner (the whole squad) and player_trajectory (a single drag-in
    candidate, so the frontend can preview a swap against the exact same
    numbers). One predict_multi_gw_breakdown call per gameweek rather than a
    single summed call, since callers need the week-by-week shape, not a
    season total - cheap, since _build_prediction_context (the expensive part)
    is cached and shared across all of these calls.
    """
    bootstrap = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    fixtures = load_fixtures(LIVE_FIXTURES_FILE)
    per_gw = {}
    for gw in next_events:
        df = predict_multi_gw_breakdown(
            ref_date, [gw],
            half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
            bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
            apply_live_signals=True,
            roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
        )
        per_gw[gw] = df.set_index("id")
    return {
        "next_events": next_events,
        "per_gw": per_gw,
        "fixtures_by_team_event": build_fixtures_by_team_event(fixtures),
        "team_short_by_id": {t["id"]: t["short_name"] for t in bootstrap["teams"]},
        "team_code_by_id": {t["id"]: t["code"] for t in bootstrap["teams"]},
        "positions_by_type": {p["id"]: p["singular_name_short"] for p in bootstrap["element_types"]},
        "elements_by_id": {p["id"]: p for p in bootstrap["elements"]},
    }


def player_trajectory_row(pid, ctx):
    """One player's {id, web_name, team_short, position, team_badge, player_photo,
    average_predicted_points, trajectory} - see build_trajectory_context. None if
    pid isn't in the live roster."""
    el = ctx["elements_by_id"].get(pid)
    if el is None:
        return None
    team_id_num = el["team"]

    trajectory = []
    for gw in ctx["next_events"]:
        df = ctx["per_gw"][gw]
        if pid in df.index:
            predicted_points = round(float(df.loc[pid, "predicted_points"]), 2)
            appearance_points = round(float(df.loc[pid, "appearance_points"]), 2)
            fixture_count = int(df.loc[pid, "fixture_count"])
        else:
            predicted_points, appearance_points, fixture_count = 0.0, 0.0, 0
        opponents = [
            {"team": ctx["team_short_by_id"][fx["opponent"]], "is_home": fx["is_home"], "difficulty": fx["difficulty"]}
            for fx in ctx["fixtures_by_team_event"][team_id_num].get(gw, [])
        ]
        trajectory.append({
            "event": gw,
            "predicted_points": predicted_points,
            "appearance_points": appearance_points,
            "fixture_count": fixture_count,
            "opponents": opponents,
            "flags": [],  # filled in below, once this player's own average is known
        })

    avg_points = sum(gw_row["predicted_points"] for gw_row in trajectory) / len(trajectory) if trajectory else 0.0
    for gw_row in trajectory:
        flags = []
        if gw_row["fixture_count"] == 0:
            flags.append("Blank gameweek - no fixture")
        else:
            tough = [o for o in gw_row["opponents"] if o["difficulty"] >= PLANNER_TOUGH_FIXTURE_FDR]
            if tough:
                worst = max(tough, key=lambda o: o["difficulty"])
                flags.append(f"Tough fixture vs {worst['team']} (FDR {worst['difficulty']})")
            if gw_row["appearance_points"] < PLANNER_ROTATION_RISK_THRESHOLD:
                flags.append("Rotation risk - not a guaranteed starter")
            if avg_points > 0 and gw_row["predicted_points"] < avg_points * PLANNER_DIP_RATIO:
                flags.append("Well below this player's own average across this window")
        gw_row["flags"] = flags

    return {
        "id": pid,
        "web_name": el["web_name"],
        "team_short": ctx["team_short_by_id"][team_id_num],
        "position": ctx["positions_by_type"].get(el["element_type"]),
        "team_badge": team_badge_url(ctx["team_code_by_id"][team_id_num]),
        "player_photo": player_photo_url(el["code"]),
        "average_predicted_points": round(avg_points, 2),
        "trajectory": trajectory,
    }


def player_trajectory(player_id, ref_date, next_event, gw_count=6):
    next_events = list(range(next_event, next_event + gw_count))
    ctx = build_trajectory_context(ref_date, next_events)
    row = player_trajectory_row(player_id, ctx)
    if row is None:
        raise ValueError(f"No player with id {player_id} in the live 2026/27 roster")
    return row


def price_watch(limit=20, history_hours=48, player_ids=None):
    """
    Players with the biggest net-transfer activity today, split into likely
    risers/fallers - see compute_price_change_signals' docstring for exactly
    what this is (and isn't). player_ids (comma-separated live element ids)
    switches to "just tell me about these specific players" mode for a
    connected manager's own squad.
    """
    bootstrap = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    history_snapshots = load_recent_bootstrap_snapshots(LIVE_BOOTSTRAP_FILE, hours=history_hours)
    df = compute_price_change_signals(bootstrap, history_snapshots=history_snapshots)

    team_short_lookup = {t["id"]: t["short_name"] for t in bootstrap["teams"]}
    team_code_by_id = {t["id"]: t["code"] for t in bootstrap["teams"]}
    df["team_short"] = df["team"].map(team_short_lookup)
    df["team_badge"] = df["team"].map(team_code_by_id).apply(team_badge_url)
    df = df.drop(columns=["team", "code"])

    if player_ids is not None:
        ids = {int(x) for x in player_ids.split(",") if x.strip()}
        owned = df[df["id"].isin(ids)].copy()
        owned = owned.reindex(owned["net_transfers_event"].abs().sort_values(ascending=False).index)
        return {
            "has_history_trend": len(history_snapshots) >= 2,
            "history_snapshot_count": len(history_snapshots),
            "min_net_transfers_to_flag": MIN_NET_TRANSFERS_TO_FLAG,
            "owned": owned.to_dict(orient="records"),
        }

    qualifying = df[df["net_transfers_event"].abs() >= MIN_NET_TRANSFERS_TO_FLAG]
    risers = qualifying[qualifying["direction"] == "rising"].sort_values("net_transfers_event", ascending=False)
    fallers = qualifying[qualifying["direction"] == "falling"].sort_values("net_transfers_event", ascending=True)

    return {
        "has_history_trend": len(history_snapshots) >= 2,
        "history_snapshot_count": len(history_snapshots),
        "min_net_transfers_to_flag": MIN_NET_TRANSFERS_TO_FLAG,
        "risers": risers.head(limit).to_dict(orient="records"),
        "fallers": fallers.head(limit).to_dict(orient="records"),
    }
