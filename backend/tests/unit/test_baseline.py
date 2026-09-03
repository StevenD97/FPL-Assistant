"""
The baseline is the bar the model has to clear, so it has to be computed
honestly - no hindsight, and a double gameweek counted as one week's return
rather than two of the last five. The categories are the paper's, and the
Zeros/Blanks split hinges on minutes rather than points.
"""
import pandas as pd
import pytest

from fpl.domain.baseline import categorise, last_n_baseline, score_by_category


@pytest.mark.parametrize("points,minutes,expected", [
    (0, 0, "Zeros"),
    (5, 0, "Zeros"),      # minutes decide, not points - an unplayed row is a Zero
    (0, 90, "Blanks"),
    (2, 45, "Blanks"),
    (3, 90, "Tickers"),
    (4, 90, "Tickers"),
    (5, 90, "Haulers"),
    (17, 90, "Haulers"),
])
def test_categorise(points, minutes, expected):
    assert categorise(points, minutes) == expected


def _history(rows):
    return pd.DataFrame(rows, columns=["element", "GW", "total_points"])


def test_baseline_reads_only_gameweeks_before_the_one_being_predicted():
    history = _history([(1, 1, 2), (1, 2, 6), (1, 3, 99)])
    assert last_n_baseline(history, gw=3) == {1: 4.0}


def test_baseline_uses_only_the_last_five_appearances():
    history = _history([(1, gw, 10 if gw > 3 else 0) for gw in range(1, 9)])
    # GWs 4-8 scored 10 each; the zeros in 1-3 must fall out of the window.
    assert last_n_baseline(history, gw=9, n=5) == {1: 10.0}


def test_a_double_gameweek_is_one_of_the_last_five_not_two():
    history = _history([(1, 1, 4), (1, 1, 4), (1, 2, 2)])
    # GW1 is a 8-point week, GW2 a 2-point week: mean 5, not (4+4+2)/3.
    assert last_n_baseline(history, gw=3) == {1: 5.0}


def test_a_player_with_no_prior_appearance_is_absent_rather_than_guessed():
    history = _history([(1, 1, 5)])
    assert 2 not in last_n_baseline(history, gw=2)


def test_no_history_at_all_gives_nothing():
    assert last_n_baseline(_history([(1, 5, 3)]), gw=1) == {}


def test_score_by_category_reports_each_category_and_a_pooled_row():
    frame = pd.DataFrame({
        "predicted_points": [1.0, 2.0, 9.0],
        "actual_points": [0, 3, 6],
        "category": ["Zeros", "Tickers", "Haulers"],
    })
    rows = {r["category"]: r for r in score_by_category(frame)}
    assert set(rows) == {"Zeros", "Tickers", "Haulers", "All"}
    assert rows["Haulers"]["rmse"] == 3.0
    assert rows["All"]["n"] == 3
    # Empty categories are skipped rather than reported as a zero error.
    assert "Blanks" not in rows
