"""
The chip scan's cost and its double-gameweek arithmetic.

Both regressions guarded here were introduced by the same well-meant change:
pointing chip timing at the live fixture calendar (correct) by calling
predict_multi_gw_breakdown once per scanned gameweek with that gameweek's own
deadline as reference_date (very expensive, and it lost the fixture count).
"""
from datetime import datetime
from unittest.mock import patch

from fpl.config import (
    ARCHIVED_BOOTSTRAP_FILE,
    ARCHIVED_FIXTURES_FILE,
    LIVE_BOOTSTRAP_FILE,
    LIVE_FIXTURES_FILE,
)
from fpl.data.loaders import load_bootstrap
from fpl.model import predict as predict_module
from fpl.model.predict import predict_by_event


REFERENCE_DATE = datetime(2026, 10, 1)


def _live_squad_ids(n=15):
    """Real live element ids, so the scan has a squad it can actually score."""
    return [p["id"] for p in load_bootstrap(LIVE_BOOTSTRAP_FILE)["elements"][:n]]


def _picks(ids):
    return {
        "picks": [
            {"element": pid, "position": pos, "is_captain": pos == 1, "is_vice_captain": pos == 2}
            for pos, pid in enumerate(ids, start=1)
        ],
        "entry_history": {"event": 2, "points": 60, "value": 1004, "bank": 5},
    }


def test_scan_builds_one_prediction_context_for_the_whole_window():
    """
    The scan is O(1) context builds, not O(gameweeks).

    Building the context is the expensive part - recency-weighted team
    strengths, involvement shares, appearance probabilities and personal
    history rates, each a full pass over the gw_history archive. Doing it per
    gameweek is what made a 15-gameweek scan take 43 seconds. If this count
    ever goes back up with the window size, the endpoint is slow again.
    """
    ids = _live_squad_ids()
    entry = {"id": 123, "name": "T", "current_event": 2}

    predict_module._predict_by_event_cached.cache_clear()
    predict_module._build_prediction_context.cache_clear()

    real_builder = predict_module._build_prediction_context.__wrapped__
    calls = []

    def counting_builder(*args, **kwargs):
        calls.append(args)
        return real_builder(*args, **kwargs)

    with patch("fpl.domain.chips.fetch_entry_info", return_value=entry), \
         patch("fpl.domain.chips.fetch_entry_picks", return_value=_picks(ids)), \
         patch.object(predict_module, "_build_prediction_context", counting_builder):
        from fpl.domain.chips import build_chip_strategy

        result = build_chip_strategy(123, 3, 18)

    assert len(result["table"]) == 15, "every gameweek in the window should be scanned"
    assert len(calls) == 1, f"expected one prediction context for the window, got {len(calls)}"


def test_predict_by_event_counts_both_fixtures_in_a_double():
    """
    A single gameweek's fixture_count must be able to say 2.

    The window-level fixture_count derives from `next_opponent != "BLANK"`,
    which for one gameweek can only ever be 0 or 1 - so chip timing's
    double_count was structurally always zero, and a Bench Boost could never
    be steered towards a double gameweek. The per-gameweek frames carry the
    real count.
    """
    ids = _live_squad_ids(1)
    frames = predict_by_event(
        REFERENCE_DATE, [3, 4],
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )
    assert set(frames) == {3, 4}
    for event, frame in frames.items():
        assert "fixture_count" in frame.columns
        blanks = frame["next_opponent"] == "BLANK"
        assert (frame.loc[blanks, "fixture_count"] == 0).all()
        assert (frame.loc[~blanks, "fixture_count"] >= 1).all()
        # A non-blank row's count must equal the number of opponents listed.
        listed = frame.loc[~blanks, "next_opponent"].str.count(" & ") + 1
        assert (frame.loc[~blanks, "fixture_count"] == listed).all()
    assert ids  # the roster is non-empty, so the frames above are meaningful


def test_predict_by_event_hands_back_copies():
    """Callers filter and mutate; the cache must not hand out its own frames."""
    first = predict_by_event(REFERENCE_DATE, [3], roster_bootstrap_file=LIVE_BOOTSTRAP_FILE,
                             roster_fixtures_file=LIVE_FIXTURES_FILE,
                             bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE)
    first[3]["predicted_points"] = -1.0
    second = predict_by_event(REFERENCE_DATE, [3], roster_bootstrap_file=LIVE_BOOTSTRAP_FILE,
                              roster_fixtures_file=LIVE_FIXTURES_FILE,
                              bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE)
    assert not (second[3]["predicted_points"] == -1.0).all()
