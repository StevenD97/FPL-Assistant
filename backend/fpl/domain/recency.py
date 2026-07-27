"""
Exponential recency weighting of gameweek-by-gameweek stats — recent matches
count for more than older ones, with a configurable half-life. Shared by the
recommendation score (fpl.domain.scoring) and the prediction model
(fpl.model), which weight every per-appearance stat this way.
"""
from fpl.data.loaders import load_gw_history


def recency_weights(kickoff_times, reference_date, half_life_days):
    """Weight halves every half_life_days - shared by every recency-weighted stat below."""
    days_ago = (reference_date - kickoff_times).dt.total_seconds() / 86400
    return 0.5 ** (days_ago / half_life_days)


def compute_recency_weighted_stat(reference_date, column, half_life_days=21, season="2025_26"):
    """
    element -> exponentially recency-weighted average of `column` from
    gw_history, using only fixtures strictly before reference_date (no
    lookahead bias). Generic version of compute_recency_weighted_form -
    used by fpl.model for every per-appearance stat (bonus, saves,
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
