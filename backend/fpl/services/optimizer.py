"""Optimizer-facing orchestration: the best-value squad under budget."""
from fpl.config import (
    ARCHIVED_BOOTSTRAP_FILE,
    ARCHIVED_FIXTURES_FILE,
    LIVE_BOOTSTRAP_FILE,
    LIVE_FIXTURES_FILE,
)
from fpl.data.loaders import load_bootstrap
from fpl.model.predict import predict_multi_gw_points
from fpl.model.rules import CROSS_SEASON_HALF_LIFE_DAYS
from fpl.optimize.squad import build_player_pool, optimize_best_squad
from fpl.services.common import attach_player_media


def best_squad(ref_date, next_event, gw_count=5, budget=1000):
    """
    The provably optimal 15-man squad (and starting XI + captain) under budget
    alone. Optimizes against predict_multi_gw_points() over a window, drafting
    from the live 2026/27 roster while training on the archived 2025/26 season
    (CROSS_SEASON_HALF_LIFE_DAYS + apply_live_signals). budget is in £0.1m units
    (1000 = £100.0m).
    """
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
    result = optimize_best_squad(pool, budget=budget)
    team_code_by_id = {t["id"]: t["code"] for t in bootstrap["teams"]}
    attach_player_media(result["squad"], team_code_by_id)
    return result
