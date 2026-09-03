"""
The counterfactual is pointed at one person's decision, so it has to be right
in both directions and silent when it cannot be sure. A record that only
surfaces the weeks the model won is an advertisement.
"""
from fpl.domain.counterfactual import captain_counterfactual

MODEL = {"id": 1, "web_name": "B.Fernandes"}
YOURS = {"id": 2, "web_name": "Palmer"}


def test_the_swing_is_the_gap_times_the_extra_multiple_not_the_multiplier():
    """
    Both players are in the eleven either way; only the doubling moves. A
    23-point captain against a 2-point one is a 21-point swing, not 42 - the
    other 21 are scored regardless of who wore the armband.
    """
    review = captain_counterfactual(MODEL, YOURS, {1: 23, 2: 2})
    assert review["points_delta"] == 21
    assert "gained you 21 points" in review["verdict"]


def test_a_triple_captain_week_triples_the_swing_argument():
    review = captain_counterfactual(MODEL, YOURS, {1: 10, 2: 4}, multiplier=3)
    assert review["points_delta"] == 12  # (10 - 4) * (3 - 1)


def test_your_own_call_beating_the_model_is_reported_just_as_plainly():
    review = captain_counterfactual(MODEL, YOURS, {1: 2, 2: 15})
    assert review["points_delta"] == -13
    assert "beat the model by 13" in review["verdict"]


def test_the_same_pick_is_not_dressed_up_as_a_win():
    review = captain_counterfactual(MODEL, MODEL, {1: 12})
    assert review["agreed"] is True
    assert review["points_delta"] == 0
    assert "same captain" in review["verdict"]


def test_different_captains_with_identical_returns_says_so():
    review = captain_counterfactual(MODEL, YOURS, {1: 6, 2: 6})
    assert review["points_delta"] == 0
    assert "no difference" in review["verdict"]


def test_an_unscoreable_player_gives_nothing_rather_than_a_guessed_zero():
    """
    Missing from the live data is not the same as blanked, and the difference
    is the entire number. Reporting "your captain scored 0" when we simply
    could not read it would be a lie about someone's own team.
    """
    assert captain_counterfactual(MODEL, YOURS, {1: 10}) is None
    assert captain_counterfactual(MODEL, YOURS, {2: 10}) is None
    assert captain_counterfactual(None, YOURS, {1: 10, 2: 10}) is None
    assert captain_counterfactual(MODEL, None, {1: 10, 2: 10}) is None


def test_the_service_grades_the_armband_from_the_frozen_file(tmp_path, monkeypatch):
    """
    End to end through the service: a frozen projection, a manager's picks, and
    live points produce the sentence. The model's pick is ranked *within the
    manager's own squad*, because "you should have captained Haaland" means
    nothing to someone who does not own him.
    """
    import json

    from fpl.services import counterfactual as service

    frozen = tmp_path / "gw07.json"
    frozen.write_text(json.dumps({
        "event": 7,
        "players": [
            # Highest projection in the game, but not in this manager's squad.
            {"id": 99, "web_name": "Haaland", "predicted_points": 9.9},
            {"id": 1, "web_name": "B.Fernandes", "predicted_points": 7.1},
            {"id": 2, "web_name": "Palmer", "predicted_points": 5.0},
        ],
    }))
    monkeypatch.setattr("fpl.domain.projections.PROJECTIONS_DIR", tmp_path)
    monkeypatch.setattr(service, "finished_events", lambda bootstrap: [6, 7])
    monkeypatch.setattr(service, "fetch_entry_picks", lambda team_id, event: {
        "picks": [
            {"element": 1, "multiplier": 1},
            {"element": 2, "multiplier": 2},  # captained Palmer
        ]
    })
    monkeypatch.setattr(service, "actual_points", lambda event: {1: (23, 90), 2: (2, 90)})

    review = service.captain_review(
        123, bootstrap={"elements": [{"id": 1, "web_name": "B.Fernandes"},
                                     {"id": 2, "web_name": "Palmer"}]})

    assert review["available"] is True
    assert review["event"] == 7
    assert review["model_pick"] == "B.Fernandes"   # not Haaland: unowned
    assert review["your_pick"] == "Palmer"
    assert review["points_delta"] == 21
    assert "gained you 21 points" in review["verdict"]


def test_the_service_refuses_when_the_week_was_never_frozen(tmp_path, monkeypatch):
    """
    Re-predicting afterwards would still be honest about its inputs, but this
    number is aimed at one person's decision - telling them what we "would
    have" said is not telling them what we did say.
    """
    from fpl.services import counterfactual as service

    monkeypatch.setattr("fpl.domain.projections.PROJECTIONS_DIR", tmp_path)
    monkeypatch.setattr(service, "finished_events", lambda bootstrap: [4])
    monkeypatch.setattr(service, "fetch_entry_picks", lambda team_id, event: {
        "picks": [{"element": 1, "multiplier": 2}]
    })
    review = service.captain_review(123, bootstrap={"elements": []})
    assert review["available"] is False
    assert "weren't frozen" in review["reason"]
