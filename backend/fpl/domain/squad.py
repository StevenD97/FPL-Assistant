"""
Squad analysis: pull a manager's live squad for a gameweek and return full
squad detail, category scores, bench depth, captaincy options and fixture
outlook (the JSON behind the My Squad page).
"""
import pandas as pd

from fpl.data.entry import fetch_entry_info, fetch_entry_picks
from fpl.data.loaders import load_bootstrap
from fpl.domain.fixtures import compute_fixture_difficulty
from fpl.domain.media import player_photo_url, team_badge_url, team_kit_url
from fpl.domain.scoring import compute_player_scores, map_archived_ids_to_live, nullable_int_column


def build_squad_analysis(team_id, event, reference_date, next_event, fixture_start_event, window_size=5,
                          bootstrap_file="bootstrap_static_2025_26_final.json",
                          fixtures_file="fixtures_2025_26_final.json"):
    """
    Pulls a manager's squad live (by team_id) for a specific gameweek and
    returns full squad detail, category scores, bench depth, captaincy
    options, and fixture outlook.

    bootstrap_file/fixtures_file default to the archived 2025/26 season
    and are passed to BOTH internal calls below - they must always match,
    since the two results get merged by team id and FPL reassigns team
    ids each season (see compute_player_scores' docstring). Mixing an
    archived player_scores with a live fixture_scores here would silently
    attach the wrong team's fixture ticker to a player.
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

    # picks come from FPL's live API, so `element` is a live-season id; the
    # merge below is against player_scores, computed from bootstrap_file
    # (archived by default) - a *different* id-space, since FPL reassigns
    # element ids every season (see compute_player_scores' docstring).
    # Remapped by code (the stable cross-season id), same fix already
    # applied to build_chip_strategy for the identical problem.
    from fpl.model.ids import resolve_live_to_training_id

    live_bootstrap_for_remap = load_bootstrap()
    archived_elements = load_bootstrap(bootstrap_file)["elements"]
    live_elements = live_bootstrap_for_remap["elements"]
    picks["element"] = picks["element"].apply(
        lambda live_id: resolve_live_to_training_id(live_id, live_elements, archived_elements)
    )
    picks = picks.dropna(subset=["element"])
    picks["element"] = picks["element"].astype(int)

    player_scores = compute_player_scores(reference_date, next_event,
                                           bootstrap_file=bootstrap_file, fixtures_file=fixtures_file)
    fixture_scores = compute_fixture_difficulty(fixture_start_event, window_size,
                                                 bootstrap_file=bootstrap_file,
                                                 fixtures_file=fixtures_file).set_index("team_id")

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

    captaincy_options = starting.sort_values("recommendation_score", ascending=False).head(5)[
        ["web_name", "team_short", "pos", "recommendation_score", "ep_next", "captain_flag"]
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
        "recommendation_score", "next_opponent", "opponent_multiplier", "rotation_risk",
        "form", "recency_weighted_form", "ep_next", "expected_minutes",
        "expected_goal_involvements", "ict_index", "defensive_contribution_per_90",
        "set_piece_duty_score", "status", "news",
    ]
    squad_rows = squad[squad_cols].copy()
    # `id` above is this bootstrap_file's element id (archived-2025/26 by
    # default) - add live_id so the frontend can link to /players/{live_id}
    # without mixing season id-spaces (see map_archived_ids_to_live).
    live_bootstrap = load_bootstrap()
    live_ids = map_archived_ids_to_live(squad_rows["id"].tolist(), load_bootstrap(bootstrap_file), live_bootstrap)
    squad_rows["live_id"] = nullable_int_column(squad_rows["id"].map(live_ids))

    # Current live price, not the archived-season one `squad` was scored
    # against - this has to line up with `bank`/`squad_value` below (both
    # live figures) for transfer-budget math to be correct.
    live_cost_by_id = {p["id"]: p["now_cost"] for p in live_bootstrap["elements"]}
    squad_rows["cost"] = squad_rows["live_id"].map(lambda lid: round(live_cost_by_id[lid] / 10, 1) if lid in live_cost_by_id else None)

    # Official PL CDN images (see team_badge_url/team_kit_url/player_photo_url).
    # `team` above is bootstrap_file's own numeric team id-space (archived by
    # default), but `code` is stable for both teams and players regardless of
    # season - safe to build these from whichever bootstrap `team`/`code`
    # here actually came from.
    team_code_by_id = {t["id"]: t["code"] for t in load_bootstrap(bootstrap_file)["teams"]}
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
        "bench_depth_score": round(bench["recommendation_score"].mean(), 3) if len(bench) else None,
        "captaincy_options": captaincy_options,
        "fixture_outlook": fixture_outlook,
    }
