"""
The season-to-date history is what switches the current-season blend on, so
the shape it produces has to match the archive the model already trains on -
same columns, one row per player per fixture, and a double gameweek split
into two rows rather than collapsed into one.
"""
import pandas as pd

from tools.build_gw_history import COLUMNS, PER_GAMEWEEK, _fixture_rows


FIXTURES = {
    11: {"id": 11, "team_h": 3, "team_a": 7, "kickoff_time": "2026-08-21T19:00:00Z",
         "team_h_score": 2, "team_a_score": 1},
    12: {"id": 12, "team_h": 9, "team_a": 3, "kickoff_time": "2026-08-24T14:00:00Z",
         "team_h_score": 0, "team_a_score": 3},
}
META = {"name": "A Player", "position": "MID", "team": "Someone", "team_id": 3,
        "value": 75, "selected": "12.3", "transfers_in": 100, "transfers_out": 20}


def _entry(explain, **stats):
    return {"id": 42, "explain": explain, "stats": {"minutes": 90, "bps": 30, **stats}}


def test_one_row_per_fixture_so_a_double_gameweek_keeps_both_matches():
    entry = _entry([
        {"fixture": 11, "stats": [{"identifier": "minutes", "points": 2, "value": 90},
                                   {"identifier": "goals_scored", "points": 5, "value": 1}]},
        {"fixture": 12, "stats": [{"identifier": "minutes", "points": 1, "value": 30}]},
    ])
    rows = _fixture_rows(entry, META, FIXTURES, event=4)
    assert len(rows) == 2
    assert [r["fixture"] for r in rows] == [11, 12]
    # Home in one, away in the other - the model reads the score off this.
    assert [r["was_home"] for r in rows] == [True, False]
    assert [r["opponent_team"] for r in rows] == [7, 9]
    assert [r["minutes"] for r in rows] == [90, 30]
    assert [r["goals_scored"] for r in rows] == [1, 0]
    assert [r["total_points"] for r in rows] == [7, 1]


def test_whole_week_figures_land_once_so_the_week_still_sums():
    entry = _entry([
        {"fixture": 11, "stats": [{"identifier": "minutes", "points": 2, "value": 90}]},
        {"fixture": 12, "stats": [{"identifier": "minutes", "points": 2, "value": 90}]},
    ], bps=44)
    rows = _fixture_rows(entry, META, FIXTURES, event=4)
    assert sum(r["bps"] for r in rows) == 44
    assert [r["bps"] for r in rows] == [44, 0]
    for key in PER_GAMEWEEK:
        assert rows[1][key] == 0


def test_an_identifier_that_scored_nothing_is_a_zero_not_a_hole():
    """FPL omits identifiers worth no points; that is a zero, not missing data."""
    entry = _entry([{"fixture": 11, "stats": [{"identifier": "minutes", "points": 1, "value": 20}]}])
    row = _fixture_rows(entry, META, FIXTURES, event=4)[0]
    assert row["goals_scored"] == 0
    assert row["clean_sheets"] == 0
    assert row["saves"] == 0


def test_a_fixture_the_snapshot_does_not_know_is_skipped():
    entry = _entry([{"fixture": 999, "stats": []}])
    assert _fixture_rows(entry, META, FIXTURES, event=4) == []


def test_every_archive_column_is_produced():
    entry = _entry([{"fixture": 11, "stats": [{"identifier": "minutes", "points": 2, "value": 90}]}])
    frame = pd.DataFrame(_fixture_rows(entry, META, FIXTURES, event=4), columns=COLUMNS)
    assert list(frame.columns) == COLUMNS
    # No column silently absent from the row dicts and filled in as NaN by the
    # reindex - except the ones FPL's live endpoint genuinely does not report.
    produced = set(_fixture_rows(entry, META, FIXTURES, event=4)[0])
    assert set(COLUMNS) - produced == set()
