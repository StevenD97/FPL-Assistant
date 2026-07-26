"""
Shared FPL analysis functions, used by scoring.py, fixture_analysis.py, and
my_squad.py. Pulling this out avoids copy-pasting the same logic into every
script that needs it.
"""

import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from functools import lru_cache

import pandas as pd
import requests

# Resolve relative to this file, not the process's working directory, so
# this works the same whether run as a script or imported by the FastAPI app.
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

FPL_API_BASE = "https://fantasy.premierleague.com/api"

# Official Premier League CDN - the exact URLs the FPL site itself uses,
# built from `team.code`/`element.code` (stable across seasons, unlike
# `id` - see map_player_stats_to_roster's docstring in team_model.py).
# No API key, no scraping - these are public static assets.
PL_RESOURCES_BASE = "https://resources.premierleague.com/premierleague"
FPL_STATIC_BASE = "https://fantasy.premierleague.com/dist/img"


def team_badge_url(team_code, size=70):
    """size: one of Premier League's served sizes - 25/40/50/70/100/110/250 are known to exist."""
    return f"{PL_RESOURCES_BASE}/badges/{size}/t{team_code}.png"


def team_kit_url(team_code):
    """The standard (home) kit icon - away/third/GK kits exist too but aren't wired up here."""
    return f"{FPL_STATIC_BASE}/shirts/standard/shirt_{team_code}-66.png"


def player_photo_url(player_code, size="250x250"):
    """size: one of "110x140" (FPL's own default headshot crop) or "250x250" (larger, used here)."""
    return f"{PL_RESOURCES_BASE}/photos/players/{size}/p{player_code}.png"


def fetch_entry_info(team_id):
    """Live lookup of a manager's basic info (name, points, current_event, etc).
    Routed through the shared resilient session (retries/backoff, but not on
    404 - see ingest.client) so the season-boundary 404s still surface fast."""
    from ingest.client import get_entry

    return get_entry(team_id)


def fetch_entry_picks(team_id, event):
    """Live lookup of a manager's 15 picks for a specific (locked) gameweek."""
    from ingest.client import get_entry_picks

    return get_entry_picks(team_id, event)


def ensure_data_fetched():
    """
    Fetch bootstrap-static + fixtures if they're not already cached on disk.
    Needed for deployment: some hosting platforms wipe local disk between
    deploys/restarts, so we can't assume data/ survives - this lets the app
    self-populate on startup instead of requiring a manual fetch step.
    """
    bootstrap_path = f"{DATA_DIR}/bootstrap_static.json"
    fixtures_path = f"{DATA_DIR}/fixtures.json"
    if os.path.exists(bootstrap_path) and os.path.exists(fixtures_path):
        return

    os.makedirs(DATA_DIR, exist_ok=True)
    for url, path in [
        (f"{FPL_API_BASE}/bootstrap-static/", bootstrap_path),
        (f"{FPL_API_BASE}/fixtures/", fixtures_path),
    ]:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        with open(path, "w", encoding="utf-8") as f:
            json.dump(response.json(), f)


def _file_fallback_allowed():
    """DB-first; fall back to the on-disk snapshots unless explicitly disabled."""
    try:
        from db.config import get_settings

        return get_settings().allow_file_fallback
    except Exception:
        return True


@lru_cache(maxsize=None)
def load_bootstrap(filename="bootstrap_static.json"):
    """
    Reads the latest bootstrap snapshot from the DB (raw_snapshots), keyed by
    the season the filename maps to; falls back to the on-disk JSON if the DB
    is empty/unreachable. Returns the verbatim FPL structure either way, so
    downstream code is unchanged. `filename` still selects the season (live
    vs the 2025/26 archive) - see db/read.py.

    Cached per filename: every predicted-points endpoint loads the same
    bootstrap repeatedly per request - measured ~50-75ms per parse of the
    ~1.4-2.7MB JSON, called 3-5x in a single /api/players request before this
    was cached. (Cache is process-lifetime; a fresh ingest is picked up on the
    next process start - the ingest job runs out-of-process.)
    """
    try:
        from db.read import bootstrap_from_db

        data = bootstrap_from_db(filename)
        if data is not None:
            return data
    except Exception:
        if not _file_fallback_allowed():
            raise
    with open(f"{DATA_DIR}/{filename}", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=None)
def load_fixtures(filename="fixtures.json"):
    """Latest fixtures snapshot from the DB, falling back to the on-disk JSON. See load_bootstrap."""
    try:
        from db.read import fixtures_from_db

        data = fixtures_from_db(filename)
        if data is not None:
            return data
    except Exception:
        if not _file_fallback_allowed():
            raise
    with open(f"{DATA_DIR}/{filename}", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=None)
def load_gw_history(season="2025_26"):
    """
    Gameweek-by-gameweek player data (one row per player per fixture). Reads
    from player_gw_stats in the DB, falling back to gw_history_<season>.csv.
    Cached per season since build_chip_strategy() calls compute_player_scores()
    - and therefore this - once per scanned gameweek.
    """
    df = None
    try:
        from db.read import gw_history_from_db

        df = gw_history_from_db(season)
    except Exception:
        df = None
    if df is None:
        if not _file_fallback_allowed():
            raise RuntimeError(f"No gw_history in DB for season {season} and file fallback is disabled")
        df = pd.read_csv(f"{DATA_DIR}/gw_history_{season}.csv")
    # Rest of the codebase (e.g. compute_congestion) treats kickoff times as
    # naive UTC, so normalize regardless of source (CSV has a "Z" suffix; the
    # DB stores naive UTC already - this is a no-op for the latter).
    df["kickoff_time"] = pd.to_datetime(df["kickoff_time"], utc=True).dt.tz_localize(None)
    df["team_id"] = df["team"].map(_team_name_to_id_map(df))
    return df


def get_gw_context(bootstrap=None):
    """
    Single source of truth for "what gameweek is it right now", derived
    from the live bootstrap's events[] (is_current/is_next/finished flags -
    see check_new_season.py for the original version of this pattern),
    instead of the hardcoded reference-date/event pairs previously
    duplicated across main.py/my_squad.py/chip_strategy.py/scoring.py.

    Returns:
      - next_event: the upcoming gameweek to predict for - events[].is_next
        if one exists (mid-season, or pre-season with GW1 still ahead), else
        the in-progress is_current gameweek (last GW of the season, no
        "next" one), else the final gameweek id if the whole season has
        finished (nothing left to predict, so pin to the last one rather
        than error).
      - reference_date: a UTC datetime guaranteed strictly before
        next_event's deadline (a few minutes before it) - safe to hand to
        every recency-weighted prediction function as "now", with no
        lookahead into that gameweek's own results.
      - is_preseason: True until FPL marks any gameweek `finished` this
        season - i.e. before 2026/27 GW1 has actually been played. Callers
        use this to decide whether archived-only training is still
        appropriate or whether live gw_history has real signal to blend in.

    Cheap: only reads the already-cached bootstrap (see load_bootstrap),
    not called per-player - safe to call once per request.
    """
    if bootstrap is None:
        bootstrap = load_bootstrap()
    events = bootstrap["events"]
    current = next((e for e in events if e["is_current"]), None)
    upcoming = next((e for e in events if e["is_next"]), None)
    any_finished = any(e["finished"] for e in events)

    if upcoming is not None:
        reference = upcoming
        reference_date = datetime.strptime(reference["deadline_time"], "%Y-%m-%dT%H:%M:%SZ") - timedelta(minutes=5)
    elif current is not None:
        reference = current
        reference_date = datetime.strptime(reference["deadline_time"], "%Y-%m-%dT%H:%M:%SZ")
    else:
        reference = max(events, key=lambda e: e["id"])
        reference_date = datetime.strptime(reference["deadline_time"], "%Y-%m-%dT%H:%M:%SZ")

    return {
        "next_event": reference["id"],
        "reference_date": reference_date,
        "is_preseason": not any_finished,
    }


def _team_name_to_id_map(history):
    """
    Builds {team full name -> numeric team id} from the history's own
    fixture/opponent_team columns instead of joining against bootstrap:
    the `team` column is a name string ("Sunderland"), but each row's
    `opponent_team` is the numeric id of the *other* side - so a
    fixture's home-row opponent_team is the away team's id and vice
    versa. Deriving it this way means it doesn't depend on whichever
    bootstrap file happens to be loaded (e.g. a newer season's, with a
    different set of promoted/relegated teams) matching this archive's
    season.
    """
    mapping = {}
    for _, fixture_rows in history.groupby("fixture"):
        home_rows = fixture_rows[fixture_rows["was_home"]]
        away_rows = fixture_rows[~fixture_rows["was_home"]]
        if home_rows.empty or away_rows.empty:
            continue
        mapping[home_rows["team"].iloc[0]] = away_rows["opponent_team"].iloc[0]
        mapping[away_rows["team"].iloc[0]] = home_rows["opponent_team"].iloc[0]
    return mapping


def recency_weights(kickoff_times, reference_date, half_life_days):
    """Weight halves every half_life_days - shared by every recency-weighted stat below."""
    days_ago = (reference_date - kickoff_times).dt.total_seconds() / 86400
    return 0.5 ** (days_ago / half_life_days)


def compute_recency_weighted_stat(reference_date, column, half_life_days=21, season="2025_26"):
    """
    element -> exponentially recency-weighted average of `column` from
    gw_history, using only fixtures strictly before reference_date (no
    lookahead bias). Generic version of compute_recency_weighted_form -
    used by team_model.py for every per-appearance stat (bonus, saves,
    cards, defensive contributions, etc.), not just total_points.
    """
    history = load_gw_history(season)
    past = history[history["kickoff_time"] < reference_date]
    if past.empty:
        return {}

    weight = recency_weights(past["kickoff_time"], reference_date, half_life_days)
    weighted_value = weight * past[column]

    weight_sum = weight.groupby(past["element"]).sum()
    weighted_value_sum = weighted_value.groupby(past["element"]).sum()
    return (weighted_value_sum / weight_sum).to_dict()


def compute_recency_weighted_form(reference_date, half_life_days=21, season="2025_26"):
    """
    element -> exponentially recency-weighted average of total_points.
    Weight halves every half_life_days, so recent matches dominate more
    than FPL's own `form` field (a flat 30-day average) while still
    factoring in the whole season rather than a hard cutoff.
    """
    return compute_recency_weighted_stat(reference_date, "total_points", half_life_days, season)


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
        "id", "code", "web_name", "team", "element_type", "status",
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
    player next season - see team_model.py's map_player_stats_to_roster
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
                })
        rows.append({
            "team_id": team_id,
            "team": short_name,
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


def detect_blank_double_gameweeks(bootstrap=None, fixtures=None):
    bootstrap = bootstrap or load_bootstrap()
    fixtures = fixtures or load_fixtures()
    teams = {t["id"]: t["short_name"] for t in bootstrap["teams"]}
    fixtures_by_team_event = build_fixtures_by_team_event(fixtures)
    all_events = sorted({e["id"] for e in bootstrap["events"]})

    blanks = []
    doubles = []
    for team_id, short_name in teams.items():
        for event in all_events:
            count = len(fixtures_by_team_event[team_id].get(event, []))
            if count == 0:
                blanks.append((event, short_name))
            elif count >= 2:
                doubles.append((event, short_name, count))
    return blanks, doubles


def build_squad_analysis(team_id, event, reference_date, next_event, fixture_start_event, window_size=5,
                          bootstrap_file="bootstrap_static_2025_26_final.json",
                          fixtures_file="fixtures_2025_26_final.json"):
    """
    Phase C: pulls a manager's squad live (by team_id) for a specific
    gameweek and returns full squad detail, category scores, bench depth,
    captaincy options, and fixture outlook - the same shape my_squad.py
    prints, but as JSON for the API.

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

    fixture_outlook = squad[["team_short", "fixture_score", "avg_difficulty", "ticker"]] \
        .drop_duplicates().sort_values("fixture_score", ascending=False).to_dict(orient="records")

    squad_cols = [
        "id", "code", "team", "position", "web_name", "team_short", "pos", "role", "captain_flag",
        "recommendation_score", "next_opponent", "opponent_multiplier", "rotation_risk",
        "form", "recency_weighted_form", "ep_next", "expected_minutes",
        "expected_goal_involvements", "ict_index", "defensive_contribution_per_90",
        "set_piece_duty_score",
    ]
    squad_rows = squad[squad_cols].copy()
    # `id` above is this bootstrap_file's element id (archived-2025/26 by
    # default) - add live_id so the frontend can link to /players/{live_id}
    # without mixing season id-spaces (see map_archived_ids_to_live).
    live_ids = map_archived_ids_to_live(squad_rows["id"].tolist(), load_bootstrap(bootstrap_file), load_bootstrap())
    squad_rows["live_id"] = nullable_int_column(squad_rows["id"].map(live_ids))

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


def build_chip_strategy(team_id, scan_start_event, scan_end_event,
                         bootstrap_file="bootstrap_static_2025_26_final.json",
                         fixtures_file="fixtures_2025_26_final.json"):
    """
    Phase D: scans a gameweek window and recommends timing for Bench Boost,
    Triple Captain, Free Hit (based on the manager's squad) and Wildcard
    (based on the league-wide blank/double gameweek calendar).

    Assumes the manager's squad (taken from their current gameweek) stays
    unchanged across the scan window - a simplifying assumption for a demo;
    a real planner would need to re-run this after every transfer.

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
    # (the stable cross-season id), same as team_model.py's roster remapping.
    from team_model import resolve_live_to_training_id

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
