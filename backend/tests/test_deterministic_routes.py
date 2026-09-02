"""
Characterization goldens for every route that is a pure function of the
committed on-disk snapshots (no live FPL calls). This is the bulk of the
analytics being moved in the reorg: loaders, media URLs, gameweek context,
recency, scoring, differentials, fixture difficulty, price signals, the
prediction model, and the optimizer.

Params are pinned to the endpoints' own current defaults (reference_date
2025-11-30 / next_event 10) so the goldens reflect real default behaviour.
`limit` is capped small purely to keep goldens reviewable; extra query params
that a given route doesn't declare are ignored by FastAPI.
"""
import pytest

from conftest import assert_golden, check_route

# Shared superset of query params. Each route binds only the ones it declares.
P = "reference_date=2025-11-30&next_event=10&gw_count=5&window_size=5&budget=1000&limit=25"

DETERMINISTIC_ROUTES = [
    ("health", "/api/health"),
    ("season_status", "/api/season-status"),
    # Deterministic because every finished gameweek is already graded in the
    # committed data/accuracy.json - the endpoint grades nothing and touches
    # no network. A missing grade would show up here as a golden that changed,
    # which is the right way to notice.
    ("accuracy", "/api/accuracy"),
    ("fixtures_difficulty", "/api/fixtures/difficulty?start_event=10&window_size=5"),
    ("fixtures_schedule", "/api/fixtures/schedule?season=live"),
    ("players_price_watch", "/api/players/price-watch?limit=20&history_hours=48"),
    ("players_scores", f"/api/players/scores?{P}"),
    ("players_scores_differentials", f"/api/players/scores?{P}&max_ownership=10"),
    ("players_predicted_points", f"/api/players/predicted-points?{P}"),
    ("players_predicted_points_outlook", f"/api/players/predicted-points-outlook?{P}"),
    ("optimizer_best_squad", f"/api/optimizer/best-squad?{P}"),
    ("squad_builder_players", f"/api/squad-builder/players?{P}"),
    ("squad_builder_fixtures", "/api/squad-builder/fixtures?next_event=10&gw_count=5"),
    ("players_all", f"/api/players?{P}"),
    ("player_detail", f"/api/players/1?{P}"),
    ("player_alternatives", f"/api/players/1/alternatives?{P}"),
    ("player_comparison", f"/api/players/1/comparison?{P}"),
    # A player the model rates highly, so the "nothing better at this price"
    # branch is covered too - the two answers are shaped differently and both
    # reach the page.
    ("player_comparison_best", f"/api/players/4/comparison?{P}"),
    ("player_trajectory", "/api/players/1/trajectory?reference_date=2025-11-30&next_event=10&gw_count=6"),
    ("teams_list", "/api/teams"),
    ("team_detail", f"/api/teams/1?{P}"),
]


@pytest.mark.parametrize("name,url", DETERMINISTIC_ROUTES, ids=[n for n, _ in DETERMINISTIC_ROUTES])
def test_route_golden(client, name, url):
    check_route(client, name, url)


def test_ready_returns_503_without_db(client):
    # DATABASE_URL points at an unreachable host in the test env, so readiness
    # must fail cleanly. The error detail carries an env-specific driver message,
    # so we pin only the status code, not the body.
    resp = client.get("/api/ready")
    assert resp.status_code == 503
    assert_golden("ready_status", {"status": resp.status_code})
