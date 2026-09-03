"""
Effective ownership is only worth showing if it is arithmetically right, and
the arithmetic is where the intuition breaks: a captain counts twice, a bench
player counts not at all, and the total can legitimately exceed 100%.
"""
import pytest

from fpl.domain.ownership import (
    differential_verdict,
    effective_ownership,
    league_differentials,
)


def _picks(*specs):
    """specs are (element, multiplier) pairs."""
    return [{"element": e, "multiplier": m} for e, m in specs]


def test_a_captain_counts_twice_and_a_bench_player_not_at_all():
    figures = effective_ownership({
        1: _picks((10, 2), (20, 1), (30, 0)),
        2: _picks((10, 1), (20, 0), (30, 0)),
    })
    assert figures[10]["effective"] == 150.0   # (2 + 1) / 2 managers
    assert figures[20]["effective"] == 50.0    # (1 + 0) / 2
    assert figures[30]["effective"] == 0.0     # benched by both
    # Plain ownership still counts all three - everyone owns all three.
    assert figures[30]["owned"] == 100.0


def test_effective_ownership_can_exceed_one_hundred_percent():
    """
    Not a bug and not a cap to apply. A player everyone starts and half the
    league captains is genuinely at 150%, and that is precisely the situation
    the number exists to warn about.
    """
    figures = effective_ownership({1: _picks((10, 2)), 2: _picks((10, 2))})
    assert figures[10]["effective"] == 200.0


def test_a_triple_captain_counts_three_times():
    figures = effective_ownership({1: _picks((10, 3))})
    assert figures[10]["effective"] == 300.0


def test_rivals_are_counted_separately_from_the_league():
    figures = effective_ownership(
        {1: _picks((10, 1)), 2: _picks((10, 1)), 3: _picks((20, 1))},
        rivals=[1, 2],
    )
    assert figures[10]["rivals_owning"] == 2
    assert figures[10]["rival_count"] == 2
    assert figures[20]["rivals_owning"] == 0


def test_a_rival_outside_the_league_is_ignored_rather_than_counted():
    figures = effective_ownership({1: _picks((10, 1))}, rivals=[1, 999])
    assert figures[10]["rival_count"] == 1


def test_no_managers_gives_nothing_rather_than_dividing_by_zero():
    assert effective_ownership({}) == {}


def test_differentials_split_what_you_hold_from_what_you_are_exposed_to():
    picks = {
        1: _picks((10, 2), (20, 1)),      # you
        2: _picks((20, 1), (30, 2)),
        3: _picks((20, 1), (30, 1)),
    }
    result = league_differentials(picks, squad_elements=[10, 20], rivals=[2])
    yours = [row["element"] for row in result["your_differentials"]]
    theirs = [row["element"] for row in result["your_exposure"]]
    assert set(yours) == {10, 20}
    assert theirs == [30]
    # Your differentials are listed least-owned first: the sharpest punt leads.
    assert yours[0] == 10


def test_exposure_is_ordered_by_what_costs_you_most():
    picks = {
        1: _picks((1, 1)),                       # you own nothing else
        2: _picks((10, 1), (20, 2)),
        3: _picks((10, 1), (20, 2)),
    }
    result = league_differentials(picks, squad_elements=[1])
    assert [row["element"] for row in result["your_exposure"]] == [20, 10]


@pytest.mark.parametrize("effective,expected_fragment", [
    (150.0, "cannot afford"),
    (75.0, "most of your league"),
    (40.0, "real chunk"),
    (10.0, "only a couple"),
])
def test_verdict_bands_for_a_player_you_do_not_own(effective, expected_fragment):
    figures = {"effective": effective, "owned_count": 3}
    assert expected_fragment in differential_verdict(figures)


def test_a_player_nobody_in_the_league_has_is_named_as_such():
    assert differential_verdict(None) == "nobody in your league has him"
    assert differential_verdict({"effective": 0.0, "owned_count": 0}) == "nobody in your league has him"


def test_everyone_owning_and_nobody_starting_is_not_a_differential():
    """
    The bug this guards: effective ownership is 0 when a player is benched by
    the whole league, and calling that "nobody has him" would send a manager
    after a differential that every single rival is already holding.
    """
    verdict = differential_verdict({"effective": 0.0, "owned_count": 8})
    assert "nobody" not in verdict


def test_owning_a_player_yourself_changes_the_sentence_not_just_the_number():
    figures = {"effective": 90.0, "owned_count": 9}
    assert differential_verdict(figures, you_own=False) == "most of your league has him"
    assert differential_verdict(figures, you_own=True) == "so does most of your league"


def test_being_the_only_owner_is_said_plainly():
    assert differential_verdict({"effective": 100.0, "owned_count": 1}, you_own=True) == (
        "you are the only one with him")
