"""
The outcome distribution is only trustworthy if it is still describing the same
projection the rest of the app shows. These check that invariant directly - the
distribution's own mean has to reconstruct what _fixture_points would total -
plus the two structural properties the modelling depends on: a player who never
appears cannot haul, and a double gameweek's threshold applies to the sum of
both fixtures rather than to each one separately.
"""
import pytest

from fpl.model.distribution import (
    CALIBRATION_KNEE,
    HAUL_THRESHOLD,
    convolve,
    fixture_outcome_distribution,
    recalibrate,
    summarise,
)


def _dist(**overrides):
    args = dict(
        position="MID",
        predicted_goals=0.25,
        predicted_assists=0.18,
        appearance={"p_any": 0.92, "p_60_plus": 0.80},
        cs_prob=0.28,
        dc_prob=0.15,
        expected_bonus=0.35,
    )
    args.update(overrides)
    return fixture_outcome_distribution(**args)


@pytest.mark.parametrize("position", ["GKP", "DEF", "MID", "FWD"])
def test_probabilities_sum_to_one(position):
    assert sum(_dist(position=position).values()) == pytest.approx(1.0)


@pytest.mark.parametrize("position", ["GKP", "DEF", "MID", "FWD"])
def test_mean_reconstructs_the_expectation(position):
    """
    The whole point of conditioning on appearance rather than convolving across
    it is that it moves where the mass sits without moving the mean. If this
    drifts, the distribution and predicted_points have come apart and one of
    them is lying.
    """
    p_any, p_60 = 0.92, 0.80
    goals, assists, cs_prob, dc_prob, bonus = 0.25, 0.18, 0.28, 0.15, 0.35
    from fpl.model.rules import (
        ASSIST_POINTS,
        CLEAN_SHEET_POINTS,
        DEFENSIVE_CONTRIBUTION_POINTS,
        GOAL_POINTS,
    )

    expected = (
        (p_any - p_60) + 2 * p_60
        + goals * GOAL_POINTS[position]
        + assists * ASSIST_POINTS
        + cs_prob * p_60 * CLEAN_SHEET_POINTS[position]
        + dc_prob * p_any * DEFENSIVE_CONTRIBUTION_POINTS
        + bonus
    )
    dist = _dist(position=position)
    mean = sum(points * p for points, p in dist.items())
    assert mean == pytest.approx(expected, abs=0.02)


def test_a_player_who_never_appears_cannot_haul():
    dist = _dist(appearance={"p_any": 0.0, "p_60_plus": 0.0})
    assert dist == {0: 1.0}
    assert summarise(dist)["haul_probability"] == 0.0


def test_the_no_appearance_branch_holds_exactly_its_own_mass():
    """No scoring outcome may leak into the branch where the player didn't play."""
    dist = _dist(appearance={"p_any": 0.6, "p_60_plus": 0.5})
    assert dist[0] == pytest.approx(0.4)


def test_a_double_gameweek_thresholds_on_the_sum_not_each_fixture():
    """
    Two four-point returns are eight points and a haul. Asking the question
    fixture by fixture would call them two non-hauls.
    """
    four = {4: 1.0}
    assert summarise(four)["haul_probability"] == 0.0
    # Certain on the raw distribution, and reported through the recalibration
    # like every other probability - it shrinks even a certainty, which is the
    # documented cost of correcting the tail empirically rather than by fiat.
    assert summarise(convolve(four, four))["haul_probability"] == round(recalibrate(1.0), 4)


def test_convolve_is_identity_against_an_empty_distribution():
    """The first fixture of the accumulation has nothing to combine with yet."""
    d = _dist()
    assert convolve({}, d) == d
    assert convolve(d, {}) == d


def test_ceiling_is_a_good_week_not_the_best_imaginable_one():
    dist = _dist(predicted_goals=0.9, predicted_assists=0.4)
    shape = summarise(dist)
    assert shape["ceiling"] >= HAUL_THRESHOLD
    assert shape["ceiling"] < max(dist)


def test_the_range_brackets_the_mean_and_is_not_zero_to_infinity():
    """
    The point of quoting a range is that it is narrower than "anything could
    happen". A floor of 0 for every player and a ceiling at the top of the
    support would be true and useless.
    """
    shape = summarise(_dist(predicted_goals=0.6, predicted_assists=0.3))
    assert shape["floor"] <= shape["mean"] <= shape["ceiling"]
    assert shape["floor"] > 0
    assert shape["ceiling"] < max(_dist(predicted_goals=0.6, predicted_assists=0.3))


def test_a_rotation_risk_has_a_floor_of_zero_because_that_is_the_truth():
    """A player who misses one week in four genuinely might score nothing."""
    shape = summarise(_dist(appearance={"p_any": 0.55, "p_60_plus": 0.4}))
    assert shape["floor"] == 0


def test_recalibration_leaves_the_honest_range_alone_and_shrinks_above_it():
    assert recalibrate(0.05) == 0.05
    assert recalibrate(CALIBRATION_KNEE) == CALIBRATION_KNEE
    assert recalibrate(0.6) < 0.6
    # Still monotone: a bigger raw probability must stay the bigger one.
    assert recalibrate(0.9) > recalibrate(0.6) > recalibrate(0.3)
