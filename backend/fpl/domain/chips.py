"""
Chip strategy: scan a gameweek window and recommend timing for Bench Boost,
Triple Captain, Free Hit (from the manager's squad) and Wildcard (from the
league-wide blank/double gameweek calendar).
"""
from collections import Counter
from datetime import datetime

import pandas as pd

from fpl.config import (
    ARCHIVED_BOOTSTRAP_FILE,
    ARCHIVED_FIXTURES_FILE,
    LIVE_BOOTSTRAP_FILE,
    LIVE_FIXTURES_FILE,
)
from fpl.data.entry import fetch_entry_info, fetch_entry_picks
from fpl.data.loaders import load_bootstrap, load_fixtures
from fpl.domain.gameweek import detect_blank_double_gameweeks
from fpl.model.predict import predict_multi_gw_breakdown
from fpl.model.rules import CHIP_RESET_EVENT, CROSS_SEASON_HALF_LIFE_DAYS


def _period_recommendation(period_table, doubles, blanks, start_event, end_event, label):
    """One period's (pre- or post-reset half) own independent chip recommendation -
    each half gets a fresh Wildcard/Free Hit/Triple Captain/Bench Boost, so a
    period straddling CHIP_RESET_EVENT must never average across both halves."""
    bb_row = period_table.loc[period_table["bench_score"].idxmax()]
    tc_row = period_table.loc[period_table["best_captain_score"].idxmax()]
    fh_row = period_table.loc[period_table["blank_count"].idxmax()]

    doubles_here = [d for d in doubles if start_event <= d[0] < end_event]
    blanks_here = [b for b in blanks if start_event <= b[0] < end_event]
    double_counts_by_event = Counter(event for event, _, _ in doubles_here)
    blank_counts_by_event = Counter(event for event, _ in blanks_here)

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
        "label": label,
        "start_event": start_event,
        "end_event": end_event - 1,
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


def build_chip_strategy(team_id, scan_start_event, scan_end_event,
                         bootstrap_file=LIVE_BOOTSTRAP_FILE,
                         fixtures_file=LIVE_FIXTURES_FILE):
    """
    Scans a gameweek window and recommends timing for Bench Boost, Triple
    Captain, Free Hit (based on the manager's squad) and Wildcard (based on
    the league-wide blank/double gameweek calendar).

    Every manager gets a completely fresh set of all four chips at
    CHIP_RESET_EVENT's deadline - an unused chip from before it is lost, not
    carried over - so a scan window straddling that gameweek must produce two
    independent recommendations (one per half), never one pooled across both;
    see periods below.

    Assumes the manager's squad (taken from their current gameweek) stays
    unchanged across the scan window - a simplifying assumption; a real
    planner would need to re-run this after every transfer.

    bootstrap_file/fixtures_file are the LIVE season's, and must stay that
    way: a chip is timed by *when* your squad's fixtures are good, so the scan
    has to run against the calendar you are actually playing. They previously
    defaulted to the archived 2025/26 files, which timed every chip by last
    season's opponents - Triple Captain came back as GW6 because in 2025/26
    that was Burnley at home, while GW6 of 2026/27 is Liverpool away, the
    hardest fixture in the window.

    The archive still does the job it is good at. Player scoring comes from
    predict_multi_gw_breakdown with bootstrap_file=ARCHIVED (the trained
    stats) and roster_bootstrap_file=live (who those players are now and who
    they face), the same split the transfer optimiser uses. That is what makes
    it safe to point this at live files without mixing id-spaces, which the
    old compute_player_scores path could not do - it reads 2025/26 gameweek
    history keyed by 2025/26 element ids.
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

    # No id remapping here any more, and none needed: picks come from FPL's
    # live API and the predictions below are produced in that same live
    # id-space (archive-trained stats remapped onto the live roster - see
    # predict_multi_gw_breakdown's roster_bootstrap_file). The old code scored
    # against the archived bootstrap, so it had to remap every pick into the
    # 2025/26 id-space and dropped any player without a 2025/26 record - which
    # silently shrank the squad a chip was being judged on.
    squad_element_ids = picks["element"].tolist()
    bench_element_ids = picks.loc[picks["position"] > 11, "element"].tolist()

    scan_events = list(range(scan_start_event, scan_end_event))

    rows = []
    for event in scan_events:
        reference_date = event_deadlines[event]
        # Predicted points on the LIVE fixture calendar. This is the whole
        # point of the fix: scoring a gameweek against the archived calendar
        # timed chips by last season's opponents. Triple Captain landed on GW6
        # because in 2025/26 that was Burnley at home; in 2026/27 it is
        # Liverpool away.
        scores = predict_multi_gw_breakdown(
            reference_date, [event],
            half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
            bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
            apply_live_signals=True,
            roster_bootstrap_file=bootstrap_file, roster_fixtures_file=fixtures_file,
        )

        squad_scores = scores[scores["id"].isin(squad_element_ids)]
        bench_scores = scores[scores["id"].isin(bench_element_ids)]
        if squad_scores.empty:
            continue
        best_captain_idx = squad_scores["predicted_points"].idxmax()

        # These now carry predicted POINTS rather than the old normalised
        # recommendation score, so "bench worth 12.4" reads as the points the
        # bench is expected to return - a number a manager can weigh a chip
        # against, where "bench worth 0.263" was not.
        rows.append({
            "event": event,
            "squad_total_score": round(squad_scores["predicted_points"].sum(), 3),
            "bench_score": round(bench_scores["predicted_points"].sum(), 3),
            "best_captain_score": round(squad_scores["predicted_points"].max(), 3),
            "best_captain_name": squad_scores.loc[best_captain_idx, "web_name"],
            "blank_count": int((squad_scores["fixture_count"] == 0).sum()),
            "double_count": int((squad_scores["fixture_count"] >= 2).sum()),
        })

    chip_table = pd.DataFrame(rows)
    blanks, doubles = detect_blank_double_gameweeks(bootstrap, fixtures)

    # Split the scan window at CHIP_RESET_EVENT if it falls inside it - each
    # side gets its own independent recommendation (see docstring).
    if scan_start_event < CHIP_RESET_EVENT < scan_end_event:
        boundaries = [
            (scan_start_event, CHIP_RESET_EVENT, "Before the reset"),
            (CHIP_RESET_EVENT, scan_end_event, "After the reset"),
        ]
    else:
        label = "After the reset" if scan_start_event >= CHIP_RESET_EVENT else "Before the reset"
        boundaries = [(scan_start_event, scan_end_event, label)]

    periods = []
    for start_event, end_event, label in boundaries:
        period_table = chip_table[(chip_table["event"] >= start_event) & (chip_table["event"] < end_event)]
        if period_table.empty:
            continue
        periods.append(_period_recommendation(period_table, doubles, blanks, start_event, end_event, label))

    return {
        "scan_start_event": scan_start_event,
        "scan_end_event": scan_end_event - 1,
        "reset_event": CHIP_RESET_EVENT,
        "table": chip_table.to_dict(orient="records"),
        "periods": periods,
    }
