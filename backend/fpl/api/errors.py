"""Shared HTTP error helpers for the API layer."""


def not_found_detail(team_id, event):
    """The message used whenever a manager's picks can't be fetched for a gameweek."""
    where = f"GW{event}" if isinstance(event, int) else event
    return (
        f"No picks found for team {team_id} at {where}. FPL appears to reset/purge "
        "manager pick history at each season boundary, so a gameweek that isn't this "
        "manager's most recent one may no longer be fetchable via the live API - see README."
    )
