"""
Fixture-level analysis: indexing fixtures by team/gameweek, short-term fixture
congestion (a rotation-risk input), and per-team fixture-difficulty scoring
over a window.
"""
from collections import defaultdict
from datetime import datetime, timedelta

import pandas as pd

from fpl.data.loaders import load_bootstrap, load_fixtures
from fpl.domain.media import team_badge_url


def build_fixtures_by_team_event(fixtures):
    """team_id -> event (gameweek) -> list of {opponent, is_home, difficulty}"""
    fixtures_by_team_event = defaultdict(lambda: defaultdict(list))
    for fx in fixtures:
        event = fx.get("event")
        if event is None:
            continue
        fixtures_by_team_event[fx["team_h"]][event].append({
            "opponent": fx["team_a"], "is_home": True, "difficulty": fx["team_h_difficulty"],
        })
        fixtures_by_team_event[fx["team_a"]][event].append({
            "opponent": fx["team_h"], "is_home": False, "difficulty": fx["team_a_difficulty"],
        })
    return fixtures_by_team_event


def compute_congestion(fixtures, team_ids, reference_date, window_days=7):
    """team_id -> extra games (beyond 1) in the window - a rotation-risk penalty input."""
    window_end = reference_date + timedelta(days=window_days)
    games_in_window = {team_id: 0 for team_id in team_ids}
    for fixture in fixtures:
        kickoff = fixture.get("kickoff_time")
        if not kickoff:
            continue
        kickoff_dt = datetime.strptime(kickoff, "%Y-%m-%dT%H:%M:%SZ")
        if reference_date <= kickoff_dt <= window_end:
            games_in_window[fixture["team_h"]] += 1
            games_in_window[fixture["team_a"]] += 1
    return {team_id: max(0, count - 1) for team_id, count in games_in_window.items()}


def compute_fixture_difficulty(start_event, window_size=5,
                                bootstrap_file="bootstrap_static.json", fixtures_file="fixtures.json"):
    """
    Per-team fixture difficulty score over [start_event, start_event + window_size).
    Defaults to the live-fetched files (unlike compute_player_scores) -
    this only touches team/fixture data, never player stats, so it's safe
    to point at the current season as soon as its fixture calendar is
    published, well before FPL resets player-level stats. build_squad_analysis
    overrides this to the archived season instead, to stay consistent with
    the player scores it's merged against - team ids get reassigned each
    season (see compute_player_scores), so mixing a live fixture_scores
    with archived player_scores here would silently merge the wrong teams.
    """
    bootstrap = load_bootstrap(bootstrap_file)
    fixtures = load_fixtures(fixtures_file)
    teams = {t["id"]: t["short_name"] for t in bootstrap["teams"]}
    team_code_by_id = {t["id"]: t["code"] for t in bootstrap["teams"]}
    fixtures_by_team_event = build_fixtures_by_team_event(fixtures)

    all_events = sorted({e["id"] for e in bootstrap["events"]})
    window_events = [e for e in all_events if start_event <= e < start_event + window_size]

    rows = []
    for team_id, short_name in teams.items():
        total_score = 0
        fixture_count = 0
        ticker = []
        fixture_list = []
        for event in window_events:
            event_fixtures = fixtures_by_team_event[team_id].get(event, [])
            if not event_fixtures:
                ticker.append("-")
            for fx in event_fixtures:
                total_score += 6 - fx["difficulty"]
                fixture_count += 1
                venue = "H" if fx["is_home"] else "A"
                ticker.append(f"{teams[fx['opponent']]}({venue},FDR{fx['difficulty']})")
                fixture_list.append({
                    "opponent": teams[fx["opponent"]], "is_home": fx["is_home"], "difficulty": fx["difficulty"],
                    "opponent_badge": team_badge_url(team_code_by_id[fx["opponent"]]),
                })
        rows.append({
            "team_id": team_id,
            "team": short_name,
            "team_badge": team_badge_url(team_code_by_id[team_id]),
            "fixtures_in_window": fixture_count,
            "fixture_score": total_score,
            "avg_difficulty": round((6 - total_score / fixture_count), 2) if fixture_count else None,
            "ticker": " | ".join(ticker),
            # Structured form of `ticker` above, for UIs that want to render
            # colored per-fixture chips instead of parsing the string
            # (Squad Builder's diagnostics still use the plain-text `ticker`
            # directly in a sentence, so that field stays as-is).
            "fixtures": fixture_list,
        })
    return pd.DataFrame(rows)
