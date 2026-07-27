"""
The recommendation score: one row per player combining playing confidence,
expected returns/form, underlying quality, defensive contribution, set-piece
duty and an opponent-strength adjustment — plus the small helpers it needs
(min-max normalisation, team-strength ratings, id remapping, differentials).
"""
import pandas as pd

from fpl.data.loaders import load_bootstrap, load_fixtures
from fpl.domain.fixtures import build_fixtures_by_team_event, compute_congestion
from fpl.domain.recency import compute_recency_weighted_form


def min_max_normalize(series):
    span = series.max() - series.min()
    if span == 0:
        return series * 0
    return (series - series.min()) / span


def get_team_strengths(bootstrap):
    """team_id -> {attack_home, attack_away, defence_home, defence_away} (FPL's own ratings)."""
    return {
        t["id"]: {
            "attack_home": t["strength_attack_home"],
            "attack_away": t["strength_attack_away"],
            "defence_home": t["strength_defence_home"],
            "defence_away": t["strength_defence_away"],
        }
        for t in bootstrap["teams"]
    }


def strength_rating_bounds(team_strengths):
    """Min/max across all teams' home+away ratings, so we can scale to 0-1 later."""
    attack_values = [v for s in team_strengths.values() for v in (s["attack_home"], s["attack_away"])]
    defence_values = [v for s in team_strengths.values() for v in (s["defence_home"], s["defence_away"])]
    return {
        "attack_min": min(attack_values), "attack_max": max(attack_values),
        "defence_min": min(defence_values), "defence_max": max(defence_values),
    }


def _scale_0_1(value, lo, hi):
    if hi == lo:
        return 0.0
    return (value - lo) / (hi - lo)


def compute_player_scores(reference_date, next_event, congestion_window_days=7,
                           w_expected_returns=0.4, w_form=0.2, w_minutes_trend=0.15,
                           w_opponent_adjustment=0.4, w_rotation_risk=0.3,
                           w_underlying_quality=0.3, w_defensive_contribution=0.15,
                           set_piece_bonus_primary=0.15, set_piece_bonus_backup=0.05,
                           penalty_miss_penalty=0.02, form_half_life_days=21,
                           bootstrap_file="bootstrap_static_2025_26_final.json",
                           fixtures_file="fixtures_2025_26_final.json"):
    """
    Returns a DataFrame, one row per player, with a recommendation_score
    combining:
      - playing confidence (status/chance_of_playing, adjusted for fixture
        congestion and historical rotation risk)
      - expected returns (ep_next), recent form (exponentially recency-
        weighted from gameweek-by-gameweek history - see
        compute_recency_weighted_form - falling back to FPL's own canned
        `form` field for players with no history, e.g. new signings), and
        a minutes-trend proxy
      - underlying quality: season xG involvement + ICT index (a longer-run,
        more stable complement to the single-week ep_next prediction)
      - defensive contribution rate (FPL's tackles/interceptions/clearances
        scoring category)
      - set-piece duty: a flat bonus for being the primary/backup taker on
        penalties, direct free-kicks, or corners/indirect free-kicks - these
        are high-value chances regardless of opponent. A missed penalty
        this season dents the bonus slightly (reflects real risk of losing
        the armband to a teammate).
      - an opponent-strength adjustment for the player's next fixture
        (attackers vs opponent defence, defenders/keepers vs opponent attack)
      - a blank/double gameweek multiplier (0 fixtures = 0 score, 2 = ~doubled)

    bootstrap_file/fixtures_file default to the archived 2025/26 season,
    not the live-fetched files: FPL publishes each new season's fixture
    calendar and team list well before it resets player-level stats
    (total_points, minutes, ep_next, etc. stay as last season's final
    values until close to kickoff), so pointing this at live data too
    early would silently compute recommendation_score off stale numbers.
    FPL also reassigns team ids alphabetically each season - team id 3
    was Burnley in 2025/26 and is Bournemouth in 2026/27 - so this must
    never mix an archived-season file with a live one; both params
    always need to point at the same season. See compute_fixture_difficulty,
    which is safe to point at live data since it doesn't touch player
    stats at all.
    """
    bootstrap = load_bootstrap(bootstrap_file)
    fixtures = load_fixtures(fixtures_file)

    players = pd.DataFrame(bootstrap["elements"])
    teams_df = pd.DataFrame(bootstrap["teams"])
    teams = teams_df[["id", "name", "short_name", "played"]]
    positions = pd.DataFrame(bootstrap["element_types"])[["id", "singular_name_short"]]
    team_short_lookup = teams_df.set_index("id")["short_name"].to_dict()

    fixtures_by_team_event = build_fixtures_by_team_event(fixtures)
    team_strengths = get_team_strengths(bootstrap)
    strength_bounds = strength_rating_bounds(team_strengths)

    congestion_by_team = compute_congestion(fixtures, teams["id"].tolist(), reference_date, congestion_window_days)

    df = players[[
        "id", "code", "web_name", "team", "element_type", "status", "news",
        "chance_of_playing_next_round", "form", "ep_next", "starts_per_90", "starts",
        "now_cost", "selected_by_percent",
        "expected_goal_involvements", "ict_index", "defensive_contribution_per_90",
        "penalties_order", "penalties_missed",
        "direct_freekicks_order", "corners_and_indirect_freekicks_order",
    ]].copy()

    df = df.merge(teams, left_on="team", right_on="id", suffixes=("", "_team"))
    df = df.merge(positions, left_on="element_type", right_on="id", suffixes=("", "_pos"))
    df = df.rename(columns={"short_name": "team_short", "singular_name_short": "position", "played": "team_played"})

    # --- Playing confidence: availability x fixture congestion x rotation risk ---
    df["confidence_raw"] = df["chance_of_playing_next_round"]
    df.loc[df["status"] != "a", "confidence_raw"] = 0
    df["confidence_raw"] = df["confidence_raw"].fillna(100)

    df["congestion"] = df["team"].map(congestion_by_team)
    df["congestion_multiplier"] = (1 - 0.10 * df["congestion"]).clip(lower=0.5)

    # Rotation risk: fraction of the team's played matches where this player
    # did NOT start. Distinct from congestion - this is about THIS player's
    # historical usage pattern, not the team's upcoming schedule.
    df["rotation_risk"] = 1 - (df["starts"] / df["team_played"].replace(0, pd.NA))
    df["rotation_risk"] = df["rotation_risk"].clip(lower=0, upper=1).fillna(0)
    df["rotation_multiplier"] = (1 - w_rotation_risk * df["rotation_risk"]).clip(lower=0.5)

    df["confidence_adjusted"] = (
        df["confidence_raw"] * df["congestion_multiplier"] * df["rotation_multiplier"]
    )

    # --- Next fixture: opponent strength (home/away aware) + blank/double count ---
    def next_fixtures_for(team_id):
        return fixtures_by_team_event[team_id].get(next_event, [])

    def opponent_multiplier(row):
        fx_list = next_fixtures_for(row["team"])
        if not fx_list:
            return 1.0  # no fixture; fixture_count=0 zeroes the score anyway
        multipliers = []
        for fx in fx_list:
            opponent_is_home = not fx["is_home"]
            suffix = "home" if opponent_is_home else "away"
            if row["position"] in ("MID", "FWD"):
                opp_rating = team_strengths[fx["opponent"]][f"defence_{suffix}"]
                toughness = _scale_0_1(opp_rating, strength_bounds["defence_min"], strength_bounds["defence_max"])
            else:  # GKP, DEF - judged on clean sheet chances vs opponent's attack
                opp_rating = team_strengths[fx["opponent"]][f"attack_{suffix}"]
                toughness = _scale_0_1(opp_rating, strength_bounds["attack_min"], strength_bounds["attack_max"])
            multipliers.append(1 - w_opponent_adjustment * toughness)
        return sum(multipliers) / len(multipliers)

    def next_opponent_label(team_id):
        fx_list = next_fixtures_for(team_id)
        if not fx_list:
            return "BLANK"
        return " & ".join(
            f"{team_short_lookup[fx['opponent']]}({'H' if fx['is_home'] else 'A'})" for fx in fx_list
        )

    df["fixture_count"] = df["team"].apply(lambda t: len(next_fixtures_for(t)))
    df["next_opponent"] = df["team"].apply(next_opponent_label)
    df["opponent_multiplier"] = df.apply(opponent_multiplier, axis=1).clip(lower=0.4)

    # --- Numeric signals ---
    df["ep_next"] = pd.to_numeric(df["ep_next"], errors="coerce").fillna(0)
    df["form"] = pd.to_numeric(df["form"], errors="coerce").fillna(0)
    df["starts_per_90"] = pd.to_numeric(df["starts_per_90"], errors="coerce").fillna(0)
    df["selected_by_percent"] = pd.to_numeric(df["selected_by_percent"], errors="coerce").fillna(0)

    # Recency-weighted form (see compute_recency_weighted_form) drives the
    # score; players with no gameweek history yet (new signings, or a
    # reference_date before the archive's first fixture) fall back to
    # FPL's own canned `form` field.
    recency_form_by_id = compute_recency_weighted_form(reference_date, form_half_life_days)
    df["recency_weighted_form"] = df["id"].map(recency_form_by_id)
    df["recency_weighted_form"] = df["recency_weighted_form"].fillna(df["form"])

    df["ep_next_norm"] = min_max_normalize(df["ep_next"])
    df["form_norm"] = min_max_normalize(df["recency_weighted_form"])
    df["starts_per_90_norm"] = min_max_normalize(df["starts_per_90"])
    df["confidence_norm"] = df["confidence_adjusted"] / 100

    # Readable "if selected, expect ~X minutes" - same info as starts_per_90,
    # just in a unit people can sanity-check at a glance.
    df["expected_minutes"] = (df["starts_per_90"].clip(upper=1) * 90).round(0)

    # --- Underlying quality: season-long xG involvement + ICT index ---
    df["expected_goal_involvements"] = pd.to_numeric(df["expected_goal_involvements"], errors="coerce").fillna(0)
    df["ict_index"] = pd.to_numeric(df["ict_index"], errors="coerce").fillna(0)
    df["defensive_contribution_per_90"] = pd.to_numeric(df["defensive_contribution_per_90"], errors="coerce").fillna(0)

    df["xgi_norm"] = min_max_normalize(df["expected_goal_involvements"])
    df["ict_index_norm"] = min_max_normalize(df["ict_index"])
    df["underlying_quality_norm"] = (df["xgi_norm"] + df["ict_index_norm"]) / 2
    df["defensive_contribution_norm"] = min_max_normalize(df["defensive_contribution_per_90"])

    # --- Set-piece duty: primary/backup taker status is extra attacking upside ---
    # NaN (no duty) becomes rank 0 - also keeps these JSON-serializable (raw
    # NaN is not valid JSON and breaks the API response).
    df["penalties_order"] = df["penalties_order"].fillna(0).astype(int)
    df["direct_freekicks_order"] = df["direct_freekicks_order"].fillna(0).astype(int)
    df["corners_and_indirect_freekicks_order"] = df["corners_and_indirect_freekicks_order"].fillna(0).astype(int)

    def duty_bonus(order):
        if order == 1:
            return set_piece_bonus_primary
        if order == 2:
            return set_piece_bonus_backup
        return 0.0

    df["penalties_missed"] = pd.to_numeric(df["penalties_missed"], errors="coerce").fillna(0)
    df["set_piece_duty_score"] = (
        df["penalties_order"].apply(duty_bonus)
        + df["direct_freekicks_order"].apply(duty_bonus)
        + df["corners_and_indirect_freekicks_order"].apply(duty_bonus)
        - penalty_miss_penalty * df["penalties_missed"]
    ).clip(lower=0)

    df["underlying_score"] = (
        (
            w_expected_returns * df["ep_next_norm"]
            + w_form * df["form_norm"]
            + w_minutes_trend * df["starts_per_90_norm"]
            + w_underlying_quality * df["underlying_quality_norm"]
            + w_defensive_contribution * df["defensive_contribution_norm"]
        ) * df["opponent_multiplier"]
        + df["set_piece_duty_score"]
    )

    df["recommendation_score"] = df["confidence_norm"] * df["underlying_score"] * df["fixture_count"]

    return df


def map_archived_ids_to_live(archived_ids, archived_bootstrap, live_bootstrap):
    """
    archived element id -> live element id, matching by FPL's stable
    `code` field - element `id` gets recompacted every season (a player
    who left the game can have their old id reused by an unrelated
    player next season - see fpl.model.ids.map_player_stats_to_roster
    for the same problem on the prediction side, and the README for the
    concrete bug this caused before it was caught). Used by endpoints
    that compute scores against the archived season but still want to
    link a row to the live player-detail page. Returns None for an id
    with no live match (retired, or left the Premier League).
    """
    archived_by_id = {p["id"]: p for p in archived_bootstrap["elements"]}
    live_code_to_id = {p["code"]: p["id"] for p in live_bootstrap["elements"]}
    result = {}
    for aid in archived_ids:
        player = archived_by_id.get(aid)
        result[aid] = live_code_to_id.get(player["code"]) if player else None
    return result


def nullable_int_column(series):
    """
    A pandas Series of ids-or-None (e.g. from mapping map_archived_ids_to_live
    over a column) as plain Python ints/None, ready for to_dict()/JSON.
    Needed because assigning a dict with some None values via Series.map()
    silently upcasts the column to float64, turning None into NaN - and
    Starlette's JSONResponse sets allow_nan=False, so a raw NaN in the
    response blows up the whole endpoint with a 500 (a real bug this
    project hit once already - see README). Returns an object-dtype
    Series (not a plain list): assigning a plain Python list of ints/None
    back into a DataFrame column re-triggers the exact same float64/NaN
    upcast this function exists to avoid, so the dtype has to be pinned
    explicitly at construction time.
    """
    return pd.Series(
        [None if pd.isna(v) else int(v) for v in series], index=series.index, dtype=object,
    )


def top_differentials(df, max_ownership=10.0, top_n=15):
    """Same recommendation_score, filtered to low-ownership players."""
    pool = df[df["selected_by_percent"] <= max_ownership]
    return pool.sort_values("recommendation_score", ascending=False).head(top_n)
