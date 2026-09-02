"""
One-off generator for the demo branch's fixed default squad.

Builds the best possible 15-man squad under budget from the *live* 2026/27
roster (via the app's own optimizer), restricted to players who have a real
2025/26 archived-season history (matched by FPL's stable `code` field) - so
every squad member has genuine season stats to show, and the manufactured
entry_history points below are computed from real gameweek-by-gameweek data,
not invented numbers.

Not part of the running app - run once, commit the JSON it writes to
backend/fpl/demo/demo_squad.json, which fpl.data.entry reads at request time
in demo mode. Re-run any time the live/archived data snapshots change and the
demo squad should be refreshed.

Run: PYTHONPATH=. python tools/build_demo_squad.py
"""
import json

import pandas as pd

from fpl.config import ARCHIVED_BOOTSTRAP_FILE, ARCHIVED_FIXTURES_FILE, LIVE_BOOTSTRAP_FILE, LIVE_FIXTURES_FILE
from fpl.data.loaders import load_bootstrap, load_gw_history
from fpl.domain.gameweek import get_gw_context
from fpl.model.ids import resolve_live_to_training_id
from fpl.model.predict import predict_multi_gw_points
from fpl.model.rules import CROSS_SEASON_HALF_LIFE_DAYS
from fpl.optimize.squad import build_player_pool, optimize_best_squad

GW_COUNT = 3  # a shorter planning horizon than the Transfers page's own default (5) -
# deliberately: an optimal-for-3-weeks squad shows a small, explainable drift (1
# sensible transfer) once the app re-evaluates it over its default 5-week window,
# instead of 0 (if built with the same window the page re-checks against) or a
# wholesale rebuild (if built from a stale, much-earlier gameweek's window).
BUDGET = 1000  # £100.0m
SIM_LAST_EVENT = 14  # last "played" gameweek in the demo simulation

DEMO_TEAM_NAME = "xFPL Demo XI"
DEMO_MANAGER_FIRST = "Demo"
DEMO_MANAGER_LAST = "Manager"
DEMO_OVERALL_RANK = 287_431


def build():
    ctx = get_gw_context()
    ref_date, next_event = ctx["reference_date"], ctx["next_event"]
    print(f"gw context: next_event={next_event} reference_date={ref_date} is_preseason={ctx['is_preseason']}")

    live_bootstrap = load_bootstrap(LIVE_BOOTSTRAP_FILE)
    archived_bootstrap = load_bootstrap(ARCHIVED_BOOTSTRAP_FILE)
    live_elements = live_bootstrap["elements"]
    archived_elements = archived_bootstrap["elements"]

    next_events = list(range(next_event, next_event + GW_COUNT))
    predicted = predict_multi_gw_points(
        ref_date, next_events,
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )
    pool = build_player_pool(predicted, live_bootstrap)

    # Restrict to players with a real archived-season history match, so the
    # demo squad's "GW1-14 stats" (below) are all genuine, not fabricated.
    archived_id_by_code = {p["code"]: p["id"] for p in archived_elements}
    live_code_by_id = {p["id"]: p["code"] for p in live_elements}
    pool = pool[pool["id"].map(lambda lid: live_code_by_id.get(lid) in archived_id_by_code)].reset_index(drop=True)
    print(f"player pool restricted to archived-matched players: {len(pool)} candidates")

    result = optimize_best_squad(pool, budget=BUDGET)
    squad = result["squad"]  # list of dicts: id, web_name, team_short, position, value, selected_by_percent, status, code, team, role, captain, cost
    print(f"optimizer squad: total_cost=£{result['total_cost']}m predicted_points={result['predicted_points']}")

    # Map each live id -> archived id (for gw_history lookups + the picks
    # payload's `element`, matching what build_squad_analysis now expects
    # after its live->archived remap fix).
    for p in squad:
        p["archived_id"] = resolve_live_to_training_id(p["id"], live_elements, archived_elements)
        assert p["archived_id"] is not None, f"{p['web_name']} has no archived match - pool filter above should have excluded this"

    gw_hist = load_gw_history("2025_26")
    gw_hist = gw_hist[gw_hist["GW"] <= SIM_LAST_EVENT]
    points_by_element_gw = gw_hist.groupby(["element", "GW"])["total_points"].sum().to_dict()

    def points_for(archived_id, gw):
        return int(points_by_element_gw.get((archived_id, gw), 0))

    starting = [p for p in squad if p["role"] == "Starting XI"]
    bench = [p for p in squad if p["role"] != "Starting XI"]
    captain = next(p for p in starting if p["captain"])
    # Vice-captain: highest predicted_points starter that isn't the captain.
    vice = max((p for p in starting if not p["captain"]), key=lambda p: p["predicted_points"])

    weekly_points = {}
    for gw in range(1, SIM_LAST_EVENT + 1):
        total = 0
        for p in starting:
            pts = points_for(p["archived_id"], gw)
            if p is captain:
                pts *= 2
            total += pts
        weekly_points[gw] = total
    season_total = sum(weekly_points.values())
    gw14_points = weekly_points[SIM_LAST_EVENT]
    print(f"weekly points GW1-14: {weekly_points}")
    print(f"season_total={season_total} gw14_points={gw14_points}")

    total_cost = sum(round(p["cost"] * 10) for p in squad)  # tenths of £1m
    bank = BUDGET - total_cost

    # Build picks: starting XI first (positions 1-11), bench next (12-15),
    # GKP-first within each group (standard FPL squad-slot convention).
    pos_order = {"GKP": 0, "DEF": 1, "MID": 2, "FWD": 3}
    starting_sorted = sorted(starting, key=lambda p: pos_order[p["position"]])
    bench_sorted = sorted(bench, key=lambda p: pos_order[p["position"]])
    ordered = starting_sorted + bench_sorted

    picks = []
    for i, p in enumerate(ordered):
        picks.append({
            "element": p["id"],  # live id - matches what the real FPL API returns
            "position": i + 1,
            "multiplier": 2 if p is captain else 1,
            "is_captain": p is captain,
            "is_vice_captain": p is vice,
        })

    entry_info = {
        "id": None,  # filled per-request with whatever team_id the visitor entered
        "player_first_name": DEMO_MANAGER_FIRST,
        "player_last_name": DEMO_MANAGER_LAST,
        "name": DEMO_TEAM_NAME,
        "summary_overall_rank": DEMO_OVERALL_RANK,
        "summary_overall_points": season_total,
        "last_deadline_value": BUDGET,
        "last_deadline_bank": bank,
        "current_event": SIM_LAST_EVENT,
        "leagues": {
            "classic": [
                {"id": 999001, "name": "xFPL Demo League", "entry_rank": 2},
            ],
        },
    }

    entry_history = {
        "event": SIM_LAST_EVENT,
        "points": gw14_points,
        "value": BUDGET,
        "bank": bank,
    }

    demo_league_standings = {
        "league_name": "xFPL Demo League",
        "standings": [
            {"entry_id": 900001, "player_name": "Alex Ferguson", "entry_name": "Fergie's XI",
             "rank": 1, "last_rank": 1, "total": season_total + 34, "event_total": gw14_points + 6},
            {"entry_id": 0, "player_name": f"{DEMO_MANAGER_FIRST} {DEMO_MANAGER_LAST}", "entry_name": DEMO_TEAM_NAME,
             "rank": 2, "last_rank": 3, "total": season_total, "event_total": gw14_points},
            {"entry_id": 900002, "player_name": "Pep G", "entry_name": "Tiki Taka FC",
             "rank": 3, "last_rank": 2, "total": season_total - 11, "event_total": gw14_points - 4},
            {"entry_id": 900003, "player_name": "Jurgen K", "entry_name": "Heavy Metal FPL",
             "rank": 4, "last_rank": 4, "total": season_total - 28, "event_total": gw14_points - 9},
            {"entry_id": 900004, "player_name": "Mikel A", "entry_name": "Highbury Heroes",
             "rank": 5, "last_rank": 5, "total": season_total - 45, "event_total": gw14_points - 13},
        ],
    }

    out = {
        "entry_info": entry_info,
        "entry_history": entry_history,
        "picks": picks,
        "league_standings": demo_league_standings,
        "squad_debug": [
            {"web_name": p["web_name"], "team_short": p["team_short"], "position": p["position"],
             "role": p["role"], "captain": p["captain"], "cost": p["cost"], "live_id": p["id"],
             "archived_id": p["archived_id"]}
            for p in ordered
        ],
    }

    out_path = "fpl/demo/demo_squad.json"
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    build()
