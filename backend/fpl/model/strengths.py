"""
Team-level scoreline strength (Dixon-Coles-style attack/defence ratios), the
cross-season blending machinery shared with fpl.model.involvement, the
team-id-space remap, and the per-fixture expected-goals / clean-sheet helpers
built on top.
"""
from fpl.data.loaders import load_gw_history
from fpl.domain.recency import recency_weights
from fpl.model.rules import (
    CROSS_SEASON_HALF_LIFE_DAYS,
    DEFAULT_TEAM_STRENGTH,
    PROMOTED_TEAM_STRENGTH,
    SHRINKAGE_GAMES,
    _poisson_pmf,
)


def _shrink_ratio(weighted_value, weight_sum, league_avg, shrinkage_games=SHRINKAGE_GAMES):
    """
    Shrinks a raw ratio (weighted_value / league_avg) toward the
    league-average ratio of 1.0, in proportion to how much recency-
    weighted evidence backs it. Without this, a team with only 1-2
    games of history (or a home/away split with barely any recent
    weight) can produce a ratio driven entirely by noise - the backtest
    found a defence_home ratio of 4.16 and a defence_away ratio of
    exactly 0.0 this way, and predict_fixture_xg multiplying two such
    ratios together produced a nonsensical ~8 expected goals for a
    single match (see README). shrinkage_games is how many "pseudo-
    games" worth of prior trust in the league average to blend in -
    weight_sum needs to be that large before the raw ratio gets even
    half its normal say.
    """
    if weighted_value is None or weight_sum == 0:
        return 1.0
    raw_ratio = weighted_value / league_avg
    shrinkage = weight_sum / (weight_sum + shrinkage_games)
    return shrinkage * raw_ratio + (1 - shrinkage) * 1.0


def _current_season_gws_played(reference_date, season):
    """
    How many of `season`'s gameweeks have kickoff data strictly before
    reference_date - the evidence signal _blend_weight below shrinks on.
    0 before that season has any results yet - true for 2026/27 as of this
    writing, where there's no DB data *and* no gw_history_2026_27.csv file
    on disk at all yet (not just an empty table/file - see load_gw_history/
    fpl.data.db.read.gw_history_from_db), so this deliberately treats "no
    data source exists for this season yet" the same as "0 games played"
    rather than letting a FileNotFoundError propagate.
    """
    try:
        history = load_gw_history(season)
    except (FileNotFoundError, RuntimeError):
        return 0
    past = history[history["kickoff_time"] < reference_date]
    return int(past["GW"].nunique()) if not past.empty else 0


def _blend_weight(n_current_gws, shrinkage_games=SHRINKAGE_GAMES):
    """
    0 current-season gameweeks played -> 0 (pure archive - identical to
    today's pre-season behaviour). Grows toward 1 as the current season
    accumulates games, using the same "pseudo-games of trust" shrinkage
    shape as _shrink_ratio, so the model is internally consistent about
    how fast it starts trusting new evidence over old.
    """
    if n_current_gws <= 0:
        return 0.0
    return n_current_gws / (n_current_gws + shrinkage_games)


def _blend_dicts(archive_dict, current_dict, weight, keys, default):
    """Per-key weighted average of two {id: {key: value}} dicts (same id-space in both - callers remap the
    archive side to the roster/current id-space first, same as every other cross-season merge in the model)."""
    blended = {}
    for entity_id in set(archive_dict) | set(current_dict):
        a = archive_dict.get(entity_id, default)
        c = current_dict.get(entity_id, default)
        blended[entity_id] = {k: weight * c[k] + (1 - weight) * a[k] for k in keys}
    return blended


def _remap_team_strengths_to_roster(team_strengths, training_teams, roster_teams):
    """
    Remaps team_strengths (keyed by training-season team ids) to the
    roster season's team ids, matching by team name. FPL reassigns team
    ids alphabetically every season (team id 3 was Burnley in 2025/26, is
    Bournemouth in 2026/27) - a bootstrap's own team ids are only ever
    meaningful against fixtures/players from that *same* bootstrap.

    Two different fallback cases, deliberately not conflated:
    - Promoted teams with no name match anywhere in the training archive
      (no top-flight history there at all - e.g. Coventry/Hull/Ipswich
      coming into 2026/27) get PROMOTED_TEAM_STRENGTH - a discounted, not
      neutral, prior (see its own comment for why).
    - A team that *does* match by name but has no recency-weighted games
      logged yet in team_strengths (e.g. very early in a season, before
      any of its fixtures have kicked off) gets DEFAULT_TEAM_STRENGTH's
      neutral 1.0 instead - a genuinely different case, since there's no
      reason to assume that team specifically is below-average.
    """
    name_to_training_id = {team["name"]: team["id"] for team in training_teams}
    remapped = {}
    for team in roster_teams:
        training_id = name_to_training_id.get(team["name"])
        if training_id is None:
            remapped[team["id"]] = PROMOTED_TEAM_STRENGTH
        else:
            remapped[team["id"]] = team_strengths.get(training_id, DEFAULT_TEAM_STRENGTH)
    return remapped


def compute_team_goal_strengths(reference_date, half_life_days=21, season="2025_26",
                                 shrinkage_games=SHRINKAGE_GAMES):
    """
    team_id -> {attack_home, attack_away, defence_home, defence_away}:
    recency-weighted goals scored/conceded, home/away split, each
    normalized against the league-wide home/away average (so 1.0 is
    league-average, >1 attack is above-average scoring, >1 defence is a
    leaky defence - the standard Dixon-Coles ratio form).

    Also returns the league-wide average home/away goals, needed to turn
    these ratios back into expected goals for a specific fixture.
    """
    history = load_gw_history(season)
    past = history[history["kickoff_time"] < reference_date]
    if past.empty:
        return {}, {"avg_home_goals": 0.0, "avg_away_goals": 0.0}

    # One row per team per fixture - player rows are duplicated per fixture.
    # GW is included alongside fixture (not just team_id) as defense-in-depth:
    # a genuine blank gameweek's row uses fixture=0 as a sentinel (see
    # fpl.data.ingest.pipeline), and a team blanking more than once in a
    # season would otherwise collide under fixture=0 alone. Real fixture ids
    # (played matches, archived or live) are already season-unique, so this
    # is a no-op for them.
    matches = past.drop_duplicates(subset=["GW", "fixture", "team_id"]).copy()
    matches["goals_for"] = matches["team_h_score"].where(matches["was_home"], matches["team_a_score"])
    matches["goals_against"] = matches["team_a_score"].where(matches["was_home"], matches["team_h_score"])
    matches["weight"] = recency_weights(matches["kickoff_time"], reference_date, half_life_days)

    home = matches[matches["was_home"]]
    away = matches[~matches["was_home"]]

    def weighted_mean(frame, col):
        if frame.empty or frame["weight"].sum() == 0:
            return None
        return (frame[col] * frame["weight"]).sum() / frame["weight"].sum()

    avg_home_goals = weighted_mean(home, "goals_for") or 1.0
    avg_away_goals = weighted_mean(away, "goals_for") or 1.0

    strengths = {}
    for team_id, team_matches in matches.groupby("team_id"):
        team_home = team_matches[team_matches["was_home"]]
        team_away = team_matches[~team_matches["was_home"]]
        home_weight = team_home["weight"].sum()
        away_weight = team_away["weight"].sum()
        strengths[team_id] = {
            "attack_home": _shrink_ratio(weighted_mean(team_home, "goals_for"), home_weight, avg_home_goals, shrinkage_games),
            "attack_away": _shrink_ratio(weighted_mean(team_away, "goals_for"), away_weight, avg_away_goals, shrinkage_games),
            # Conceded-at-home is compared against the away-scoring average (what
            # a typical away side would put past them), and vice versa.
            "defence_home": _shrink_ratio(weighted_mean(team_home, "goals_against"), home_weight, avg_away_goals, shrinkage_games),
            "defence_away": _shrink_ratio(weighted_mean(team_away, "goals_against"), away_weight, avg_home_goals, shrinkage_games),
        }

    return strengths, {"avg_home_goals": avg_home_goals, "avg_away_goals": avg_away_goals}


def compute_team_goal_strengths_blended(reference_date, half_life_days=21,
                                         archive_season="2025_26", current_season="2026_27",
                                         archive_half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
                                         shrinkage_games=SHRINKAGE_GAMES,
                                         archive_bootstrap=None, roster_bootstrap=None):
    """
    Team strengths blended across the archived and current seasons, ending
    up in the *roster* (current-season) team-id space either way - the
    season-transition sequel to compute_team_goal_strengths, for once the
    current season actually has results to train on.

    Before current_season has any finished gameweeks strictly before
    reference_date, this is mathematically identical to today's archive-
    only + by-name roster remap (_remap_team_strengths_to_roster) - the
    blend weight is exactly 0 (see _blend_weight), so this is a strict
    superset of existing behaviour, not a change to it, for every request
    made before 2026/27 GW1 is actually played. As current-season
    gameweeks accumulate, weight shifts toward that season's own (fresher,
    but noisier) team strengths.

    archive_bootstrap/roster_bootstrap, if given, must be the full
    bootstrap dicts for their respective seasons (only ["teams"] is used) -
    required to remap the archive side into the roster's team-id space
    before blending (FPL reassigns team ids every season). Omit both to
    blend two already-same-id-space seasons directly (no remap needed).
    """
    archive_strengths, archive_avgs = compute_team_goal_strengths(
        reference_date, archive_half_life_days, archive_season, shrinkage_games)
    if archive_bootstrap is not None and roster_bootstrap is not None:
        archive_strengths = _remap_team_strengths_to_roster(
            archive_strengths, archive_bootstrap["teams"], roster_bootstrap["teams"])

    weight = _blend_weight(_current_season_gws_played(reference_date, current_season), shrinkage_games)
    if weight == 0.0:
        return archive_strengths, archive_avgs

    current_strengths, current_avgs = compute_team_goal_strengths(
        reference_date, half_life_days, current_season, shrinkage_games)
    blended_strengths = _blend_dicts(
        archive_strengths, current_strengths, weight,
        ["attack_home", "attack_away", "defence_home", "defence_away"], DEFAULT_TEAM_STRENGTH,
    )
    blended_avgs = {
        "avg_home_goals": weight * current_avgs["avg_home_goals"] + (1 - weight) * archive_avgs["avg_home_goals"],
        "avg_away_goals": weight * current_avgs["avg_away_goals"] + (1 - weight) * archive_avgs["avg_away_goals"],
    }
    return blended_strengths, blended_avgs


def predict_fixture_xg(home_team_id, away_team_id, team_strengths, league_avgs):
    """Expected goals for both sides of a fixture (Dixon-Coles multiplicative form)."""
    home = team_strengths.get(home_team_id, DEFAULT_TEAM_STRENGTH)
    away = team_strengths.get(away_team_id, DEFAULT_TEAM_STRENGTH)
    home_xg = league_avgs["avg_home_goals"] * home["attack_home"] * away["defence_away"]
    away_xg = league_avgs["avg_away_goals"] * away["attack_away"] * home["defence_home"]
    return home_xg, away_xg


def clean_sheet_probability(expected_goals_against):
    """Poisson P(goals against = 0) = e^-lambda."""
    return _poisson_pmf(0, expected_goals_against)
