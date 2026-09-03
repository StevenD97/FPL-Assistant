"""
Live lookups of a manager's own FPL entry (team) — thin wrappers over the
resilient ingest client (retries/backoff, but not on 404, so the
season-boundary 404s still surface fast — see fpl.data.ingest.client).

The client module is looked up at call time (``client.get_entry``) rather than
binding the functions at import, so tests can stub the network at the client
seam.
"""
from fpl.data.ingest import client


def fetch_entry_info(team_id):
    """Live lookup of a manager's basic info (name, points, current_event, etc)."""
    return client.get_entry(team_id)


def fetch_entry_picks(team_id, event):
    """Live lookup of a manager's 15 picks for a specific (locked) gameweek."""
    return client.get_entry_picks(team_id, event)


def fetch_entry_history(team_id):
    """Live lookup of a manager's gameweek-by-gameweek history and played chips."""
    return client.get_entry_history(team_id)
