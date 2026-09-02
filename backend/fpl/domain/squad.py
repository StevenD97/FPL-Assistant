"""
Squad analysis: pull a manager's live squad for a gameweek and return full
squad detail, category scores, bench depth, captaincy options and fixture
outlook (the JSON behind the My Squad page).
"""
import pandas as pd

from fpl.config import (
    ARCHIVED_BOOTSTRAP_FILE,
    ARCHIVED_FIXTURES_FILE,
    LIVE_BOOTSTRAP_FILE,
    LIVE_FIXTURES_FILE,
)
from fpl.data.entry import fetch_entry_info, fetch_entry_picks
from fpl.data.loaders import load_bootstrap
from fpl.domain.fixtures import compute_fixture_difficulty
from fpl.domain.media import player_photo_url, team_badge_url, team_kit_url
from fpl.domain.scoring import (
    rank_desc,
    compute_player_scores,
    nullable_float_column,
)
from fpl.model.predict import predict_multi_gw_points
from fpl.model.rules import CROSS_SEASON_HALF_LIFE_DAYS


def build_squad_analysis(team_id, event, reference_date, next_event, fixture_start_event, window_size=5,
                          bootstrap_file=ARCHIVED_BOOTSTRAP_FILE,
                          fixtures_file=ARCHIVED_FIXTURES_FILE,
                          roster_bootstrap_file=LIVE_BOOTSTRAP_FILE,
                          roster_fixtures_file=LIVE_FIXTURES_FILE):
    """
    Pulls a manager's squad live (by team_id) for a specific gameweek and
    returns full squad detail, category scores, bench depth, captaincy
    options, and fixture outlook.

    Everything here happens in the LIVE season's id-space. bootstrap_file /
    fixtures_file are the training archive the season-long stats come from;
    roster_bootstrap_file / roster_fixtures_file are the season being played,
    and every id, club, fixture and price on the page is theirs. See
    compute_player_scores.

    This used to run the other way round - remap the manager's picks back into
    the archive's id-space, score there, and translate the ids at the end -
    and the page was wrong in four visible ways at once because of it. FPL
    reassigns element ids every season, so a pick with no 2025/26 record
    (a promoted club's player, a summer signing) had nothing to map onto and
    was dropped: a fifteen-man squad rendered as thirteen players, "10 in the
    XI", "3 on the bench" and the impossible formation 3-3-3. The players who
    did survive were labelled with last season's clubs and shown last
    season's opponents.
    """
    entry = fetch_entry_info(team_id)
    if event is None:
        # No caller-specified gameweek: use this manager's own most recently
        # scored one (FPL's own current_event), same source of truth
        # build_chip_strategy already uses for its basis_event - a manager's
        # picks for any *other* gameweek may not be fetchable at all (FPL
        # appears to purge/reset pick history at each season boundary).
        event = entry.get("current_event")
        if event is None:
            raise ValueError(
                f"Manager {team_id} has no current_event yet - the season may not have started "
                "(no gameweek has locked for them yet)."
            )
    picks_data = fetch_entry_picks(team_id, event)

    picks = pd.DataFrame(picks_data["picks"])

    # No remapping, and none wanted: `element` is a live-season id and every
    # frame it is joined to below is built in that same live id-space. The
    # squad on the page is the squad FPL has, all fifteen of them, under the
    # clubs they play for now.
    player_scores = compute_player_scores(
        reference_date, next_event,
        bootstrap_file=bootstrap_file, fixtures_file=fixtures_file,
        roster_bootstrap_file=roster_bootstrap_file, roster_fixtures_file=roster_fixtures_file,
    )
    fixture_scores = compute_fixture_difficulty(fixture_start_event, window_size,
                                                 bootstrap_file=roster_bootstrap_file,
                                                 fixtures_file=roster_fixtures_file).set_index("team_id")

    # Predicted points, so the page can talk in points rather than in a
    # normalised internal score. Two horizons, because the page asks two
    # different questions:
    #
    #   predicted_points      - the whole fixture-outlook window. "Is this
    #                           squad set up well for the next few weeks?"
    #   predicted_points_next - the next gameweek alone. Captaincy and Bench
    #                           Boost are single-gameweek decisions, and
    #                           ranking them on a five-gameweek total answers
    #                           a question nobody asked.
    #
    # Both share one prediction context (same reference_date), so the second
    # call is close to free - see predict_by_event.
    def _points(events, column):
        frame = predict_multi_gw_points(
            reference_date, events,
            half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
            bootstrap_file=bootstrap_file, fixtures_file=fixtures_file,
            apply_live_signals=True,
            roster_bootstrap_file=roster_bootstrap_file, roster_fixtures_file=roster_fixtures_file,
        )[["id", "predicted_points"]]
        return frame.rename(columns={"predicted_points": column})

    window_events = list(range(next_event, next_event + window_size))
    for events, column in ((window_events, "predicted_points"), ([next_event], "predicted_points_next")):
        player_scores = player_scores.merge(_points(events, column), on="id", how="left")
        player_scores[column] = player_scores[column].fillna(0.0).round(2)

    squad = picks.merge(player_scores, left_on="element", right_on="id", suffixes=("", "_score"))
    squad = squad.merge(
        fixture_scores[["fixture_score", "avg_difficulty", "ticker"]],
        left_on="team", right_index=True,
    )
    squad = squad.rename(columns={"position_score": "pos"})  # 'position' = squad slot 1-15, 'pos' = GKP/DEF/MID/FWD

    squad["role"] = "Bench"
    squad.loc[squad["position"] <= 11, "role"] = "Starting XI"

    squad["captain_flag"] = ""
    squad.loc[squad["is_captain"], "captain_flag"] = "(C)"
    squad.loc[squad["is_vice_captain"], "captain_flag"] = "(VC)"

    squad = squad.sort_values("position")

    starting = squad[squad["role"] == "Starting XI"]
    bench = squad[squad["role"] == "Bench"]

    category_scores = {
        pos: round(starting.loc[starting["pos"] == pos, "recommendation_score"].mean(), 3)
        for pos in ["GKP", "DEF", "MID", "FWD"]
        if (starting["pos"] == pos).any()
    }

    # What the bench is worth, in points, over the same window as the fixture
    # outlook. The old bench_depth_score was the mean of an internal
    # normalised recommendation_score and reached the page as "BENCH STRENGTH
    # 0.133" - a number with no unit, no scale and nothing to compare it to.
    # Four expected points from a bench is a fact a manager can weigh against
    # a Bench Boost; 0.133 is not.
    bench_predicted_points = round(float(bench["predicted_points_next"].sum()), 1) if len(bench) else 0.0

    captaincy_options = rank_desc(starting, "predicted_points_next", 5)[
        ["web_name", "team_short", "pos", "recommendation_score", "predicted_points",
         "predicted_points_next", "ep_next", "captain_flag", "next_opponent"]
    ].to_dict(orient="records")

    # team_badge/fixtures (structured, badge-ready form of `ticker`) come from
    # fixture_scores directly rather than through `squad`'s own merged copy -
    # `fixtures` is a list-of-dicts column, which pandas' drop_duplicates()
    # can't hash, so it's attached after dedup instead of selected alongside
    # the other (hashable) columns below.
    fixture_details_by_team_short = fixture_scores.set_index("team")[["team_badge", "fixtures"]].to_dict(orient="index")
    fixture_outlook = squad[["team_short", "fixture_score", "avg_difficulty", "ticker"]] \
        .drop_duplicates().sort_values("fixture_score", ascending=False).to_dict(orient="records")
    for row in fixture_outlook:
        details = fixture_details_by_team_short.get(row["team_short"], {})
        row["team_badge"] = details.get("team_badge")
        row["fixtures"] = details.get("fixtures", [])

    squad_cols = [
        "id", "code", "team", "position", "web_name", "team_short", "pos", "role", "captain_flag",
        "recommendation_score", "predicted_points", "predicted_points_next",
        "next_opponent", "opponent_multiplier",
        "rotation_risk", "form", "recency_weighted_form", "ep_next", "expected_minutes",
        "expected_goal_involvements", "expected_goals_per_90", "expected_assists_per_90",
        "ict_index", "defensive_contribution_per_90",
        "set_piece_duty_score", "selected_by_percent", "status", "news",
    ]
    squad_rows = squad[squad_cols].copy()
    live_bootstrap = load_bootstrap(roster_bootstrap_file)
    # `id` is already the live element id, so live_id is the same number. The
    # field stays because the frontend links to /players/{live_id}; it used to
    # be the output of a cross-season code lookup that returned None - and so
    # an unclickable row - for anyone the archive had never heard of.
    squad_rows["live_id"] = squad_rows["id"]

    # Price straight off the live roster, matching `bank`/`squad_value` below
    # so transfer-budget math is consistent.
    live_cost_by_id = {p["id"]: p["now_cost"] for p in live_bootstrap["elements"]}
    squad_rows["cost"] = nullable_float_column(
        [
            round(live_cost_by_id[pid] / 10, 1) if pid in live_cost_by_id else None
            for pid in squad_rows["id"]
        ],
        squad_rows.index,
    )

    # selected_by_percent already comes from the live roster (see
    # _overlay_archive_stats_onto_roster - ownership is deliberately not one
    # of the archived fields), so there is nothing to overlay here any more.
    # It has to be live: the page uses it to call a pick a differential, and
    # last season's finishing ownership is not what "differential" means this
    # week.

    # Official PL CDN images (see team_badge_url/team_kit_url/player_photo_url).
    team_code_by_id = {t["id"]: t["code"] for t in live_bootstrap["teams"]}
    squad_rows["team_code"] = squad_rows["team"].map(team_code_by_id)
    squad_rows["team_badge"] = squad_rows["team_code"].apply(team_badge_url)
    squad_rows["team_kit"] = squad_rows["team_code"].apply(team_kit_url)
    squad_rows["player_photo"] = squad_rows["code"].apply(player_photo_url)
    squad_rows = squad_rows.drop(columns=["team", "code", "team_code"])

    return {
        "entry_name": entry["name"],
        "event": picks_data["entry_history"]["event"],
        "points": picks_data["entry_history"]["points"],
        "squad_value": picks_data["entry_history"]["value"] / 10,
        "bank": picks_data["entry_history"]["bank"] / 10,
        "squad": squad_rows.to_dict(orient="records"),
        "category_scores": category_scores,
        "bench_predicted_points": bench_predicted_points,
        "bench_depth_score": round(bench["recommendation_score"].mean(), 3) if len(bench) else None,
        "captaincy_options": captaincy_options,
        "fixture_outlook": fixture_outlook,
        # How many gameweeks fixture_outlook's avg_difficulty is averaged over, so
        # the frontend can label it instead of guessing. Same reasoning as
        # gw_count/next_event on the optimiser response: a window size the caller
        # chose but the payload doesn't state is a number the reader can only
        # misinterpret - and the nearest available guess (the planner's own
        # window) is a different length, so guessing gets it wrong.
        "fixture_window": window_size,
    }
