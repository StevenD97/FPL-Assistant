"""Fixture-facing orchestration: the difficulty table and the season schedule."""
from fpl.config import (
    ARCHIVED_BOOTSTRAP_FILE,
    ARCHIVED_FIXTURES_FILE,
    LIVE_BOOTSTRAP_FILE,
    LIVE_FIXTURES_FILE,
)
from fpl.data.loaders import load_bootstrap, load_fixtures
from fpl.domain.fixtures import compute_fixture_difficulty
from fpl.domain.gameweek import get_gw_context
from fpl.domain.media import team_badge_by_short_name


def fixture_difficulty(start_event=None, window_size=5):
    if start_event is None:
        start_event = get_gw_context()["next_event"]
    df = compute_fixture_difficulty(start_event, window_size)
    return df.sort_values("fixture_score", ascending=False).to_dict(orient="records")


def fixtures_schedule(season="live"):
    """
    The full season's fixture list (all events), with kickoff time and result
    if played. season="live" (default) uses the live 2026/27 calendar;
    season="archive" uses the archived 2025/26 files.

    Three separate FPL flags decide whether a fixture has a result yet, and
    only carrying ``finished`` is not enough: FPL leaves it False until the
    whole gameweek is processed (bonus confirmed), which can be days after
    the final whistle. Two gameweeks into 2026/27, all nine played GW2
    matches were ``finished: false, finished_provisional: true`` with real
    90-minute scores - a consumer keying off ``finished`` alone shows a
    kickoff time for a match that ended two days ago. So pass ``started``
    and ``finished_provisional`` through too, and let the caller distinguish
    not-yet-kicked-off / in progress / result in.
    """
    if season == "archive":
        bootstrap_file, fixtures_file = ARCHIVED_BOOTSTRAP_FILE, ARCHIVED_FIXTURES_FILE
    else:
        bootstrap_file, fixtures_file = LIVE_BOOTSTRAP_FILE, LIVE_FIXTURES_FILE

    bootstrap = load_bootstrap(bootstrap_file)
    fixtures = load_fixtures(fixtures_file)
    teams = {t["id"]: t["short_name"] for t in bootstrap["teams"]}
    team_badges = team_badge_by_short_name(bootstrap)

    rows = []
    for fx in fixtures:
        if fx.get("event") is None:
            continue
        rows.append({
            "event": fx["event"],
            "kickoff_time": fx["kickoff_time"],
            "started": bool(fx.get("started")),
            "finished": fx["finished"],
            "finished_provisional": bool(fx.get("finished_provisional")),
            "team_h": teams[fx["team_h"]],
            "team_a": teams[fx["team_a"]],
            "team_h_badge": team_badges[teams[fx["team_h"]]],
            "team_a_badge": team_badges[teams[fx["team_a"]]],
            "team_h_score": fx["team_h_score"],
            "team_a_score": fx["team_a_score"],
            "team_h_difficulty": fx["team_h_difficulty"],
            "team_a_difficulty": fx["team_a_difficulty"],
        })
    rows.sort(key=lambda r: (r["event"], r["kickoff_time"]))
    return rows
