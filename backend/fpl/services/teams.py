"""
Team-level research view: the club-scoped counterpart to the Players page -
one page per Premier League club, ranking that club's live 2026/27 roster
across the core attacking/defensive/discipline stats, plus the forward-
looking model projection (xPts/xMins). "Actual" numbers come from the
archived 2025/26 season totals (see the live/archived split in the README -
the live bootstrap's own season totals are still pre-season zeros),
remapped onto the live roster and grouped by each player's LIVE club - this
season's actual squads, not last season's.
"""
from fpl.config import (
    ARCHIVED_BOOTSTRAP_FILE,
    ARCHIVED_FIXTURES_FILE,
    LIVE_BOOTSTRAP_FILE,
    LIVE_FIXTURES_FILE,
)
from fpl.data.loaders import load_bootstrap
from fpl.domain.managers import manager_name
from fpl.domain.media import player_photo_url, team_badge_url
from fpl.domain.scoring import compute_player_scores
from fpl.model.ids import map_player_stats_to_roster
from fpl.model.predict import predict_multi_gw_points
from fpl.model.rules import CROSS_SEASON_HALF_LIFE_DAYS

# Archived-season fields needed for the "actual" side of each leaderboard.
# Kept local to this module (not fpl.services.players' SEASON_STAT_FIELDS)
# since "defensive_contribution" isn't used by any existing player-facing
# endpoint and there's no reason to widen that shared, golden-tested list
# just for this one.
TEAM_STAT_FIELDS = [
    "total_points", "goals_scored", "assists", "minutes", "bonus",
    "yellow_cards", "red_cards", "expected_goals", "expected_assists",
    "expected_goal_involvements", "defensive_contribution",
]

# One entry per leaderboard the team page renders, in display order. "actual"
# metrics come straight from TEAM_STAT_FIELDS (or a simple derived sum, for
# goal_involvements); "model" metrics are this app's own forward-looking
# projection for the next gw_count gameweeks, not an FPL-published stat.
METRICS = [
    {"key": "total_points", "label": "Points", "short": "PTS", "kind": "actual"},
    {"key": "predicted_points", "label": "xPts", "short": "xPTS", "kind": "model"},
    {"key": "goals_scored", "label": "Goals", "short": "GLS", "kind": "actual"},
    {"key": "expected_goals", "label": "xG", "short": "xG", "kind": "actual"},
    {"key": "assists", "label": "Assists", "short": "AST", "kind": "actual"},
    {"key": "expected_assists", "label": "xA", "short": "xA", "kind": "actual"},
    {"key": "goal_involvements", "label": "Goal involvements", "short": "GI", "kind": "actual"},
    {"key": "expected_goal_involvements", "label": "xGI", "short": "xGI", "kind": "actual"},
    {"key": "minutes", "label": "Minutes", "short": "MIN", "kind": "actual"},
    {"key": "expected_minutes", "label": "xMins", "short": "xMIN", "kind": "model"},
    {"key": "defensive_contribution", "label": "Defensive contributions", "short": "DC", "kind": "actual"},
    {"key": "yellow_cards", "label": "Yellow cards", "short": "YC", "kind": "actual"},
    {"key": "red_cards", "label": "Red cards", "short": "RC", "kind": "actual"},
    {"key": "bonus", "label": "Bonus points", "short": "BON", "kind": "actual"},
]

TOP_N = 5


def _season_stats_by_live_id():
    """
    THIS season's TEAM_STAT_FIELDS totals, straight off the live roster.

    The "actual" half of every leaderboard on the team page, so it has to be
    about the season being played - see fpl.services.players' equivalent for
    the archive-shaped bug this replaces. The "model" half is a forward
    projection and is unaffected.
    """
    live = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    return {p["id"]: {f: p.get(f) for f in TEAM_STAT_FIELDS} for p in live["elements"]}


def _expected_minutes_by_live_id(ref_date, next_event):
    """
    Per-match expected minutes if selected (0-90), from compute_player_scores'
    starts_per_90-derived figure - the same number the recommendation score
    itself is built from. Computed against the archived season (that
    function's default) and remapped onto the live roster like everything
    else here, rather than reinventing a second minutes model.
    """
    archived = load_bootstrap(ARCHIVED_BOOTSTRAP_FILE)
    live = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    scores = compute_player_scores(ref_date, next_event)
    by_training_id = {
        int(row["id"]): {"expected_minutes": row["expected_minutes"]} for _, row in scores.iterrows()
    }
    return map_player_stats_to_roster(by_training_id, archived["elements"], live["elements"])


def list_teams():
    """Live 2026/27 clubs, alphabetical, with crest - the /teams index."""
    live = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "short_name": t["short_name"],
            "team_badge": team_badge_url(t["code"]),
            "manager": manager_name(t["code"]),
        }
        for t in sorted(live["teams"], key=lambda t: t["name"])
    ]


def team_detail(team_id, ref_date, next_event, gw_count=5):
    live = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    team = next((t for t in live["teams"] if t["id"] == team_id), None)
    if team is None:
        raise ValueError(f"No team with id {team_id} in the live 2026/27 roster")

    positions_by_id = {p["id"]: p["singular_name_short"] for p in live["element_types"]}
    squad = [p for p in live["elements"] if p["team"] == team_id]

    season_stats = _season_stats_by_live_id()
    expected_minutes = _expected_minutes_by_live_id(ref_date, next_event)

    next_events = list(range(next_event, next_event + gw_count))
    predicted = predict_multi_gw_points(
        ref_date, next_events,
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )
    predicted_by_id = predicted.set_index("id")["predicted_points"].to_dict()

    players = []
    for p in squad:
        stats = season_stats.get(p["id"], {})
        goals = stats.get("goals_scored") or 0
        assists = stats.get("assists") or 0
        players.append({
            "id": p["id"],
            "web_name": p["web_name"],
            "position": positions_by_id[p["element_type"]],
            "player_photo": player_photo_url(p["code"]),
            "status": p["status"],
            "total_points": stats.get("total_points") or 0,
            "predicted_points": round(float(predicted_by_id.get(p["id"], 0.0)), 2),
            "goals_scored": goals,
            "expected_goals": round(float(stats.get("expected_goals") or 0), 2),
            "assists": assists,
            "expected_assists": round(float(stats.get("expected_assists") or 0), 2),
            "goal_involvements": goals + assists,
            "expected_goal_involvements": round(float(stats.get("expected_goal_involvements") or 0), 2),
            "minutes": stats.get("minutes") or 0,
            "expected_minutes": round(float(expected_minutes.get(p["id"], {}).get("expected_minutes") or 0)),
            "defensive_contribution": stats.get("defensive_contribution") or 0,
            "yellow_cards": stats.get("yellow_cards") or 0,
            "red_cards": stats.get("red_cards") or 0,
            "bonus": stats.get("bonus") or 0,
        })

    leaderboards = {}
    for metric in METRICS:
        key = metric["key"]
        ranked = sorted((r for r in players if r[key] > 0), key=lambda r: r[key], reverse=True)
        leaderboards[key] = [
            {
                "id": r["id"], "web_name": r["web_name"], "position": r["position"],
                "player_photo": r["player_photo"], "value": r[key],
            }
            for r in ranked[:TOP_N]
        ]

    return {
        "id": team["id"],
        "name": team["name"],
        "short_name": team["short_name"],
        "team_badge": team_badge_url(team["code"]),
        "manager": manager_name(team["code"]),
        "squad_size": len(squad),
        "has_season_history": any(p["total_points"] > 0 for p in players),
        "metrics": METRICS,
        "leaderboards": leaderboards,
    }
