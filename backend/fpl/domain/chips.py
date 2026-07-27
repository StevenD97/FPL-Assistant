"""
Chip strategy: scan a gameweek window and recommend timing for Bench Boost,
Triple Captain, Free Hit (from the manager's squad) and Wildcard (from the
league-wide blank/double gameweek calendar).
"""
from collections import Counter
from datetime import datetime

import pandas as pd

from fpl.data.entry import fetch_entry_info, fetch_entry_picks
from fpl.data.loaders import load_bootstrap, load_fixtures
from fpl.domain.gameweek import detect_blank_double_gameweeks
from fpl.domain.scoring import compute_player_scores


def build_chip_strategy(team_id, scan_start_event, scan_end_event,
                         bootstrap_file="bootstrap_static_2025_26_final.json",
                         fixtures_file="fixtures_2025_26_final.json"):
    """
    Scans a gameweek window and recommends timing for Bench Boost, Triple
    Captain, Free Hit (based on the manager's squad) and Wildcard (based on
    the league-wide blank/double gameweek calendar).

    Assumes the manager's squad (taken from their current gameweek) stays
    unchanged across the scan window - a simplifying assumption; a real
    planner would need to re-run this after every transfer.

    bootstrap_file/fixtures_file default to the archived 2025/26 season -
    every event_deadlines/compute_player_scores/detect_blank_double_gameweeks
    call below must use the same season's files, since FPL reassigns team
    ids each season (see compute_player_scores' docstring); mixing seasons
    here would silently scan the wrong fixtures against the wrong scores.
    """
    bootstrap = load_bootstrap(bootstrap_file)
    fixtures = load_fixtures(fixtures_file)

    event_deadlines = {
        e["id"]: datetime.strptime(e["deadline_time"], "%Y-%m-%dT%H:%M:%SZ")
        for e in bootstrap["events"]
    }

    entry = fetch_entry_info(team_id)
    basis_event = entry.get("current_event") or (scan_start_event - 1)
    picks_data = fetch_entry_picks(team_id, basis_event)
    picks = pd.DataFrame(picks_data["picks"])

    # picks come from FPL's live API, so `element` is a live-season id; scores
    # below are computed against bootstrap_file (archived by default), a
    # *different* id-space - FPL reassigns element ids every season (see
    # compute_player_scores' docstring). Without remapping, the .isin() match
    # below silently drops or mismatches most of the squad. Matched by code
    # (the stable cross-season id), same as fpl.model.ids' roster remapping.
    from fpl.model.ids import resolve_live_to_training_id

    live_bootstrap = load_bootstrap()
    live_elements = live_bootstrap["elements"]
    training_elements = bootstrap["elements"]
    picks["element"] = picks["element"].apply(
        lambda live_id: resolve_live_to_training_id(live_id, live_elements, training_elements)
    )
    picks = picks.dropna(subset=["element"])
    picks["element"] = picks["element"].astype(int)
    squad_element_ids = picks["element"].tolist()
    bench_element_ids = picks.loc[picks["position"] > 11, "element"].tolist()

    scan_events = list(range(scan_start_event, scan_end_event))

    rows = []
    for event in scan_events:
        reference_date = event_deadlines[event]
        scores = compute_player_scores(reference_date, event,
                                        bootstrap_file=bootstrap_file, fixtures_file=fixtures_file)

        squad_scores = scores[scores["id"].isin(squad_element_ids)]
        bench_scores = scores[scores["id"].isin(bench_element_ids)]
        best_captain_idx = squad_scores["recommendation_score"].idxmax()

        rows.append({
            "event": event,
            "squad_total_score": round(squad_scores["recommendation_score"].sum(), 3),
            "bench_score": round(bench_scores["recommendation_score"].sum(), 3),
            "best_captain_score": round(squad_scores["recommendation_score"].max(), 3),
            "best_captain_name": squad_scores.loc[best_captain_idx, "web_name"],
            "blank_count": int((squad_scores["fixture_count"] == 0).sum()),
            "double_count": int((squad_scores["fixture_count"] >= 2).sum()),
        })

    chip_table = pd.DataFrame(rows)

    bb_row = chip_table.loc[chip_table["bench_score"].idxmax()]
    tc_row = chip_table.loc[chip_table["best_captain_score"].idxmax()]
    fh_row = chip_table.loc[chip_table["blank_count"].idxmax()]

    blanks, doubles = detect_blank_double_gameweeks(bootstrap, fixtures)
    doubles_in_scan = [d for d in doubles if scan_start_event <= d[0] < scan_end_event]
    blanks_in_scan = [b for b in blanks if scan_start_event <= b[0] < scan_end_event]
    double_counts_by_event = Counter(event for event, _, _ in doubles_in_scan)
    blank_counts_by_event = Counter(event for event, _ in blanks_in_scan)

    wildcard_recommendation = None
    if double_counts_by_event:
        biggest_dgw_event, num_teams = double_counts_by_event.most_common(1)[0]
        wildcard_recommendation = {
            "reason": f"GW{biggest_dgw_event} has the most teams doubling league-wide ({num_teams} teams)",
            "suggested_event": biggest_dgw_event - 1,
        }
    elif blank_counts_by_event:
        biggest_bgw_event, num_teams = blank_counts_by_event.most_common(1)[0]
        wildcard_recommendation = {
            "reason": f"GW{biggest_bgw_event} has the most teams blanking league-wide ({num_teams} teams)",
            "suggested_event": biggest_bgw_event,
        }

    return {
        "scan_start_event": scan_start_event,
        "scan_end_event": scan_end_event - 1,
        "table": chip_table.to_dict(orient="records"),
        "bench_boost": {
            "event": int(bb_row["event"]), "bench_score": bb_row["bench_score"],
            "double_count": int(bb_row["double_count"]),
        },
        "triple_captain": {
            "event": int(tc_row["event"]), "player": tc_row["best_captain_name"],
            "score": tc_row["best_captain_score"],
        },
        "free_hit": {
            "recommended": bool(fh_row["blank_count"] >= 3),
            "event": int(fh_row["event"]), "blank_count": int(fh_row["blank_count"]),
        },
        "wildcard": wildcard_recommendation,
    }
