"""
The freeze is a promise: these numbers existed before kick-off. Everything
worth testing here is about not breaking that promise - freezing early enough
to be meaningful, never freezing after the fact, and never rewriting a file
that has already been committed to.
"""
import json
from datetime import datetime, timedelta

import pytest

from fpl.domain.projections import SOURCE_FROZEN, SOURCE_RECONSTRUCTED, load_frozen
from tools.freeze_projections import FREEZE_WINDOW_HOURS, _next_event, freeze

DEADLINE = datetime(2026, 9, 4, 17, 30)


def _bootstrap(finished_through=2):
    return {
        "events": [
            {
                "id": gw,
                "finished": gw <= finished_through,
                "deadline_time": (DEADLINE + timedelta(days=7 * (gw - 3))).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            for gw in range(1, 6)
        ]
    }


def test_next_event_is_the_soonest_unfinished_one():
    event, deadline = _next_event(_bootstrap())
    assert event == 3
    assert deadline == DEADLINE


def test_does_nothing_while_the_deadline_is_still_far_off(tmp_path, monkeypatch):
    monkeypatch.setattr("fpl.domain.projections.PROJECTIONS_DIR", tmp_path)
    monkeypatch.setattr("tools.freeze_projections.PROJECTIONS_DIR", tmp_path)
    far_off = DEADLINE - timedelta(hours=FREEZE_WINDOW_HOURS + 1)
    assert freeze(now=far_off, bootstrap=_bootstrap()) is None
    assert list(tmp_path.iterdir()) == []


def test_refuses_to_freeze_after_the_deadline(tmp_path, monkeypatch):
    """
    The whole claim is "before kick-off". A file written afterwards would look
    identical and mean nothing, so this is the one case that must never
    silently succeed.
    """
    monkeypatch.setattr("fpl.domain.projections.PROJECTIONS_DIR", tmp_path)
    monkeypatch.setattr("tools.freeze_projections.PROJECTIONS_DIR", tmp_path)
    assert freeze(now=DEADLINE + timedelta(minutes=1), bootstrap=_bootstrap()) is None
    assert list(tmp_path.iterdir()) == []


def test_never_overwrites_an_existing_freeze(tmp_path, monkeypatch):
    monkeypatch.setattr("fpl.domain.projections.PROJECTIONS_DIR", tmp_path)
    monkeypatch.setattr("tools.freeze_projections.PROJECTIONS_DIR", tmp_path)
    existing = tmp_path / "gw03.json"
    existing.write_text(json.dumps({"event": 3, "players": [{"id": 1}]}))
    assert freeze(now=DEADLINE - timedelta(hours=2), bootstrap=_bootstrap()) is None
    assert json.loads(existing.read_text())["players"] == [{"id": 1}]


def test_the_season_ending_is_not_an_error(tmp_path, monkeypatch):
    monkeypatch.setattr("tools.freeze_projections.PROJECTIONS_DIR", tmp_path)
    all_done = {"events": [{"id": 38, "finished": True, "deadline_time": "2027-05-23T14:00:00Z"}]}
    assert freeze(now=DEADLINE, bootstrap=all_done) is None


def test_a_corrupt_freeze_falls_back_rather_than_taking_the_page_down(tmp_path, monkeypatch):
    monkeypatch.setattr("fpl.domain.projections.PROJECTIONS_DIR", tmp_path)
    (tmp_path / "gw03.json").write_text("{ this is not json")
    assert load_frozen(3) is None


def test_an_empty_freeze_is_treated_as_no_freeze(tmp_path, monkeypatch):
    monkeypatch.setattr("fpl.domain.projections.PROJECTIONS_DIR", tmp_path)
    (tmp_path / "gw03.json").write_text(json.dumps({"event": 3, "players": []}))
    assert load_frozen(3) is None


def test_the_two_sources_are_distinct_labels():
    assert SOURCE_FROZEN != SOURCE_RECONSTRUCTED
