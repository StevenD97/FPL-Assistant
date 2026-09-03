"""
Squad/manager-facing orchestration: the "connect your team" summary, the
Squad Builder pool and fixtures, and the pure-compute halves of squad
analysis, chip strategy, transfer optimisation and the multi-gameweek planner.

The live-fetch + HTTP error mapping for the manager routes lives in the router
(it depends on request-scoped team_id/event for its messages); these functions
own the computation once the inputs are in hand.
"""
from fpl.config import (
    ARCHIVED_BOOTSTRAP_FILE,
    ARCHIVED_FIXTURES_FILE,
    LIVE_BOOTSTRAP_FILE,
    LIVE_FIXTURES_FILE,
)
from fpl.data.entry import fetch_entry_info
from fpl.data.loaders import load_bootstrap
from fpl.domain.chips import build_chip_strategy
from fpl.domain.rationale import transfer_reason
from fpl.domain.why_not import why_not_take_a_hit
from fpl.domain.scoring import rank_desc
from fpl.domain.fixtures import compute_fixture_difficulty
from fpl.domain.gameweek import get_gw_context
from fpl.domain.media import player_photo_url, team_badge_url, team_kit_url
from fpl.domain.squad import build_squad_analysis
from fpl.model.predict import predict_multi_gw_breakdown, predict_multi_gw_points
from fpl.model.rules import CROSS_SEASON_HALF_LIFE_DAYS
from fpl.optimize.squad import build_player_pool, optimize_transfers
from fpl.services.common import attach_player_media
from fpl.services.players import build_trajectory_context, player_trajectory_row


def entry_summary(team_id):
    """
    Lightweight public lookup of a manager's headline info (name, team name,
    overall rank, squad value, bank). Values come back in tenths of a million
    (last_deadline_value=1004 -> £100.4m). Lets FPL HTTPErrors propagate for
    the router to translate to a CORS-correct HTTPException.
    """
    info = fetch_entry_info(team_id)
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


def squad_builder_players(ref_date, next_event, gw_count=5):
    """
    The full player pool for the manual Squad Builder page: predicted points
    (multi-gameweek), set-piece duty, appearance_points (rotation-risk proxy),
    value, ownership, and live availability. Uses predict_multi_gw_breakdown()
    for appearance_points. Drafts from the live 2026/27 roster.
    """
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
    team_code_by_id = {t["id"]: t["code"] for t in bootstrap["teams"]}
    pool = pool.copy()
    pool["team_code"] = pool["team"].map(team_code_by_id)
    pool["team_badge"] = pool["team_code"].apply(team_badge_url)
    pool["team_kit"] = pool["team_code"].apply(team_kit_url)
    pool["player_photo"] = pool["code"].apply(player_photo_url)
    cols = [
        "id", "web_name", "team_short", "position", "now_cost", "predicted_points", "value",
        "selected_by_percent", "status", "news", "penalties_order", "direct_freekicks_order",
        "corners_and_indirect_freekicks_order", "appearance_points", "fixture_count", "fixture_ticker",
        "team_badge", "team_kit", "player_photo",
    ]
    df = pool[cols].rename(columns={"now_cost": "cost_raw"})
    df["cost"] = (df["cost_raw"] / 10).round(1)
    return rank_desc(df.drop(columns="cost_raw"), "predicted_points").to_dict(orient="records")


def squad_builder_fixtures(next_event=None, gw_count=5):
    """Team-level fixture difficulty for the Squad Builder diagnostics, pinned to the live 2026/27 fixtures/teams."""
    if next_event is None:
        next_event = get_gw_context()["next_event"]
    return compute_fixture_difficulty(
        next_event, gw_count, bootstrap_file=LIVE_BOOTSTRAP_FILE, fixtures_file=LIVE_FIXTURES_FILE,
    ).to_dict(orient="records")


def squad_analysis(team_id, event, ref_date, next_event, fixture_start_event, window_size=5):
    """Full squad detail for a manager's live squad. Lets FPL HTTPError / ValueError propagate for the router."""
    if fixture_start_event is None:
        fixture_start_event = next_event
    return build_squad_analysis(team_id, event, ref_date, next_event, fixture_start_event, window_size)


def chip_strategy(team_id, scan_start_event, scan_end_event):
    """Chip-timing recommendations across a gameweek window. Lets FPL HTTPError propagate for the router."""
    return build_chip_strategy(team_id, scan_start_event, scan_end_event)


def optimize_transfers_compute(current_squad_ids, bank, ref_date, next_event,
                               gw_count=5, free_transfers=1, max_transfers=None, exact_transfers=None):
    """The provably optimal set of transfers for a squad, drawn from the live 2026/27 pool."""
    next_events = list(range(next_event, next_event + gw_count))
    bootstrap = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    # The breakdown rather than the headline total, for appearance_points: the
    # single most decision-relevant number behind most swaps is how often each
    # player is expected to be on the pitch, and a points total alone cannot
    # say it. Shares a cache with predict_multi_gw_points, so this costs
    # nothing extra - see predict_multi_gw_breakdown.
    predicted = predict_multi_gw_breakdown(
        ref_date, next_events,
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )[["id", "web_name", "team_short", "position", "predicted_points",
       "appearance_points", "fixture_count", "fixture_ticker"]]
    pool = build_player_pool(predicted, bootstrap)
    result = optimize_transfers(
        pool, current_squad_ids, bank=bank, free_transfers=free_transfers,
        max_transfers=max_transfers, exact_transfers=exact_transfers,
    )
    team_code_by_id = {t["id"]: t["code"] for t in bootstrap["teams"]}
    attach_player_media(result["squad"], team_code_by_id)
    attach_player_media(result["transferred_out"], team_code_by_id)
    attach_player_media(result["transferred_in"], team_code_by_id)
    # So the frontend can say exactly what starting_xi_predicted_points/predicted_points
    # are summed over, instead of leaving the reader to guess whether a combined
    # multi-gameweek total is a single gameweek's score (see SuggestedTransfers.tsx).
    result["gw_count"] = gw_count
    result["next_event"] = next_event

    # Pair each incoming player with the one they replace, and say why in a
    # sentence. The optimiser returns two flat lists, so the pairing is by
    # order - which is also how every caller renders them, side by side.
    #
    # The same sentence goes on both halves of a pair (it names both players
    # anyway), rather than a directional "replaces"/"replaced_by" pair of
    # fields: the two lists stay the same shape, and a caller showing either
    # side has the whole explanation without having to look up the other.
    for player_in, player_out in zip(result["transferred_in"], result["transferred_out"]):
        reason = transfer_reason(player_in, player_out, gw_count)
        player_in["reason"] = reason
        player_out["reason"] = reason

    result["hit_verdict"] = _hit_verdict(
        pool, current_squad_ids, bank, free_transfers, result, gw_count,
        skip=exact_transfers is not None,
    )
    return result


def _hit_verdict(pool, current_squad_ids, bank, free_transfers, free_result, gw_count, skip=False):
    """
    "Why not take a -4?" - answered by solving it rather than asserting it.

    The optimiser deliberately never proposes a hit (see optimize_transfers for
    why the objective cannot price one), which leaves the most common question a
    manager asks themselves unanswered. So the same problem is solved once more
    with one extra transfer forced, and the two totals are compared against the
    four points it would cost.

    Skipped when the caller already pinned the transfer count - they asked a
    different question and a second solve would be answering neither.

    A failed solve returns None rather than raising: an unanswerable side
    question must not take down the answer the page came for.
    """
    if skip:
        return None
    try:
        with_hit = optimize_transfers(
            pool, current_squad_ids, bank=bank, free_transfers=free_transfers,
            exact_transfers=free_result["transfers_made"] + 1,
        )
    except Exception:
        return None
    return why_not_take_a_hit(
        free_gain=free_result["starting_xi_predicted_points"],
        hit_gain=with_hit["starting_xi_predicted_points"],
        gw_count=gw_count,
    )


def squad_planner_compute(squad_element_ids, event, ref_date, next_event, gw_count=6):
    """Per-player, per-gameweek trajectories for a manager's squad, best average first."""
    next_events = list(range(next_event, next_event + gw_count))
    ctx = build_trajectory_context(ref_date, next_events)
    players = [row for pid in squad_element_ids if (row := player_trajectory_row(pid, ctx)) is not None]
    players.sort(key=lambda p: p["average_predicted_points"], reverse=True)
    return {"event": event, "next_events": next_events, "players": players}
