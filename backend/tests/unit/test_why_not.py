"""
A "why not" that can only defend the recommendation is a rationalisation. These
check that each answer changes when the comparison changes - including when the
honest answer is "your idea is better than ours".
"""
from fpl.domain.why_not import why_not_captain, why_not_chip_now, why_not_take_a_hit


def _option(name, points, haul=None):
    row = {"web_name": name, "predicted_points_next": points}
    if haul is not None:
        row["haul_probability"] = haul
    return row


def test_the_captain_answer_leads_with_the_projection_gap():
    text = why_not_captain(_option("Haaland", 7.4), _option("Palmer", 5.9))
    assert "Palmer projects 1.5 fewer points than Haaland" in text


def test_a_runner_up_with_the_bigger_ceiling_is_said_so_not_argued_away():
    """
    The interesting case: the safer pick projects higher but the alternative is
    likelier to have the big week. That is a real trade-off and a manager is
    entitled to make it, so the sentence presents it rather than closing it.
    """
    text = why_not_captain(
        _option("Haaland", 7.4, haul=0.30), _option("Palmer", 6.9, haul=0.38))
    assert "likelier to haul (38% against 30%)" in text
    assert "bigger ceiling on Palmer" in text


def test_a_lower_haul_chance_reinforces_rather_than_complicates():
    text = why_not_captain(
        _option("Haaland", 7.4, haul=0.36), _option("Palmer", 5.9, haul=0.21))
    assert "less likely to haul (21% against 36%)" in text


def test_an_alternative_that_out_projects_the_pick_is_conceded():
    text = why_not_captain(_option("Haaland", 6.0), _option("Palmer", 7.2))
    assert "actually projects 1.2 more" in text
    assert "your call" in text


def test_comparing_the_pick_against_itself_says_nothing():
    assert why_not_captain(_option("Haaland", 7.0), _option("Haaland", 7.0)) is None
    assert why_not_captain(None, _option("Palmer", 5.0)) is None


def test_a_hit_is_priced_against_one_gameweek_not_the_whole_horizon():
    """
    The trap: +7 over five gameweeks against a 4-point hit looks like a clear
    yes and is not. You are not choosing between having the player and never
    having him - next week's free transfer makes the same move for nothing - so
    the hit only buys about one gameweek of the advantage, and 1.4 a week does
    not repay 4.
    """
    text = why_not_take_a_hit(free_gain=40.0, hit_gain=47.0)
    assert text.startswith("No:")
    assert "1.4 points a gameweek" in text
    assert "next week's free transfer" in text


def test_a_move_that_clears_the_hit_in_the_first_week_is_recommended():
    text = why_not_take_a_hit(free_gain=40.0, hit_gain=65.0)  # 5.0 a week
    assert "Worth it" in text
    assert "clears the 4-point hit in the first week" in text


def test_an_extra_transfer_that_improves_nothing_says_so_before_the_hit():
    text = why_not_take_a_hit(free_gain=40.0, hit_gain=40.0)
    assert "does not improve the squad at all" in text


def test_holding_a_chip_quotes_both_weeks():
    text = why_not_chip_now("Bench Boost", this_week=6.2, best_week=18.4, best_event=29)
    assert "6.2 this week and 18.4 in GW29" in text
    assert "gains you 12.2" in text


def test_this_being_the_best_week_is_the_answer():
    assert "This is the week" in why_not_chip_now("Bench Boost", 18.4, 18.4, 29)
