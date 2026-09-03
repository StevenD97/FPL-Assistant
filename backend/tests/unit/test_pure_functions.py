"""
Unit tests for the pure functions the reorg isolated into small modules.
These need no data files or network — they exercise the maths and helpers
directly, complementing the characterization goldens (which prove the
end-to-end responses are unchanged).
"""
import math

import pandas as pd
import pytest

from fpl.domain.fixtures import build_fixtures_by_team_event, compute_congestion
from fpl.domain.media import player_photo_url, team_badge_url, team_kit_url
from fpl.domain.scoring import (
    map_archived_ids_to_live,
    min_max_normalize,
    nullable_int_column,
    top_differentials,
)
from fpl.model.ids import map_player_stats_to_roster, resolve_live_to_training_id
from fpl.model.rules import (
    _poisson_expected_floor_division,
    _poisson_pmf,
    _poisson_prob_at_least,
)
from fpl.model.strengths import _shrink_ratio, clean_sheet_probability, predict_fixture_xg


# --- model.rules: Poisson helpers -------------------------------------------

def test_poisson_pmf_sums_to_one():
    assert sum(_poisson_pmf(k, 2.5) for k in range(60)) == pytest.approx(1.0, abs=1e-9)


def test_poisson_prob_at_least_threshold_zero_is_certain():
    assert _poisson_prob_at_least(3.0, 0) == 1.0


def test_poisson_prob_at_least_is_monotonic_in_threshold():
    probs = [_poisson_prob_at_least(3.0, t) for t in range(0, 8)]
    assert probs == sorted(probs, reverse=True)  # higher threshold -> never more likely


def test_poisson_expected_floor_division_by_one_is_the_mean():
    assert _poisson_expected_floor_division(2.0, 1) == pytest.approx(2.0, abs=1e-6)


# --- model.strengths --------------------------------------------------------

def test_clean_sheet_probability_zero_xga_is_certain():
    assert clean_sheet_probability(0.0) == pytest.approx(1.0)


def test_clean_sheet_probability_decreases_with_more_expected_goals_against():
    probs = [clean_sheet_probability(x) for x in (0.5, 1.0, 2.0, 3.0)]
    assert probs == sorted(probs, reverse=True)
    assert all(0.0 < p <= 1.0 for p in probs)
    assert clean_sheet_probability(1.0) == pytest.approx(math.exp(-1.0))


def test_shrink_ratio_no_evidence_returns_league_average():
    assert _shrink_ratio(None, 0, 1.5) == 1.0
    assert _shrink_ratio(3.0, 0, 1.5) == 1.0


def test_shrink_ratio_approaches_raw_ratio_with_lots_of_evidence():
    raw = _shrink_ratio(3.0, 10_000, 1.5)  # raw ratio = 2.0
    assert raw == pytest.approx(2.0, abs=1e-2)


def test_predict_fixture_xg_neutral_strengths_returns_league_averages():
    league = {"avg_home_goals": 1.5, "avg_away_goals": 1.1}
    home_xg, away_xg = predict_fixture_xg(1, 2, team_strengths={}, league_avgs=league)  # unknown ids -> DEFAULT 1.0
    assert home_xg == pytest.approx(1.5)
    assert away_xg == pytest.approx(1.1)


# --- model.ids: cross-season remap by stable `code` ------------------------

_TRAIN = [{"id": 1, "code": 100}, {"id": 2, "code": 200}]
_ROSTER = [{"id": 10, "code": 100}, {"id": 20, "code": 200}, {"id": 30, "code": 300}]


def test_map_player_stats_to_roster_matches_by_code():
    stats = {1: {"x": 5}, 2: {"x": 9}}
    assert map_player_stats_to_roster(stats, _TRAIN, _ROSTER) == {10: {"x": 5}, 20: {"x": 9}}


def test_map_player_stats_to_roster_drops_players_with_no_code_match():
    # roster id 30 (code 300) has no training history -> absent, not guessed.
    assert 30 not in map_player_stats_to_roster({1: {"x": 5}}, _TRAIN, _ROSTER)


def test_resolve_live_to_training_id_roundtrips_by_code():
    assert resolve_live_to_training_id(10, _ROSTER, _TRAIN) == 1
    assert resolve_live_to_training_id(30, _ROSTER, _TRAIN) is None  # no archive record
    assert resolve_live_to_training_id(999, _ROSTER, _TRAIN) is None  # not in live roster


# --- domain.media -----------------------------------------------------------

def test_media_urls_are_built_from_codes():
    assert team_badge_url(3) == "https://resources.premierleague.com/premierleague/badges/70/t3.png"
    assert team_badge_url(3, size=250).endswith("/badges/250/t3.png")
    assert team_kit_url(3).endswith("/shirts/standard/shirt_3-66.png")
    # A keeper wears his side's keeper kit, which FPL serves as a `_1` variant.
    assert team_kit_url(3, "GKP").endswith("/shirts/standard/shirt_3_1-66.png")
    assert team_kit_url(3, "DEF").endswith("/shirts/standard/shirt_3-66.png")
    # Headshots come from the /premierleague25/ bucket with no `p` prefix - the
    # legacy /premierleague/photos/.../p<code>.png images are last season's, so
    # a summer signing is served in his old club's kit there.
    assert player_photo_url(12345) == (
        "https://resources.premierleague.com/premierleague25/photos/players/110x140/12345.png"
    )


# --- domain.scoring helpers -------------------------------------------------

def test_min_max_normalize_scales_to_unit_interval():
    out = min_max_normalize(pd.Series([10.0, 20.0, 30.0]))
    assert list(out) == pytest.approx([0.0, 0.5, 1.0])


def test_min_max_normalize_constant_series_is_all_zero():
    assert list(min_max_normalize(pd.Series([7.0, 7.0, 7.0]))) == [0.0, 0.0, 0.0]


def test_nullable_int_column_keeps_none_as_none_not_nan():
    out = nullable_int_column(pd.Series([1.0, None, 3.0]))
    assert out.tolist() == [1, None, 3]
    assert out.dtype == object  # object dtype avoids the float64/NaN upcast that 500s JSON


def test_top_differentials_filters_by_ownership_and_ranks_by_score():
    df = pd.DataFrame({
        "selected_by_percent": [5.0, 50.0, 8.0],
        "recommendation_score": [1.0, 9.0, 2.0],
        "web_name": ["a", "b", "c"],
    })
    out = top_differentials(df, max_ownership=10.0, top_n=5)
    assert out["web_name"].tolist() == ["c", "a"]  # b excluded (50% owned), c ranks above a


def test_map_archived_ids_to_live_by_code():
    archived = {"elements": [{"id": 1, "code": 100}, {"id": 2, "code": 200}]}
    live = {"elements": [{"id": 11, "code": 100}]}  # code 200 left the league
    assert map_archived_ids_to_live([1, 2], archived, live) == {1: 11, 2: None}


# --- domain.fixtures --------------------------------------------------------

def test_build_fixtures_by_team_event_indexes_both_sides():
    fixtures = [{"event": 5, "team_h": 1, "team_a": 2, "team_h_difficulty": 3, "team_a_difficulty": 4}]
    idx = build_fixtures_by_team_event(fixtures)
    assert idx[1][5] == [{"opponent": 2, "is_home": True, "difficulty": 3}]
    assert idx[2][5] == [{"opponent": 1, "is_home": False, "difficulty": 4}]


def test_build_fixtures_by_team_event_skips_unscheduled():
    assert build_fixtures_by_team_event([{"event": None, "team_h": 1, "team_a": 2,
                                          "team_h_difficulty": 3, "team_a_difficulty": 3}]) == {}


def test_compute_congestion_counts_extra_games_in_window():
    from datetime import datetime
    ref = datetime(2025, 11, 1)
    fixtures = [
        {"kickoff_time": "2025-11-02T15:00:00Z", "team_h": 1, "team_a": 2},
        {"kickoff_time": "2025-11-05T20:00:00Z", "team_h": 1, "team_a": 3},  # team 1 plays twice in 7d
        {"kickoff_time": "2025-12-20T15:00:00Z", "team_h": 1, "team_a": 4},  # outside window
    ]
    congestion = compute_congestion(fixtures, [1, 2, 3, 4], ref, window_days=7)
    assert congestion[1] == 1  # one extra game beyond the first
    assert congestion[2] == 0
    assert congestion[4] == 0
