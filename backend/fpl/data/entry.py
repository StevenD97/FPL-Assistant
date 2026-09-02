"""
Live lookups of a manager's own FPL entry (team) — thin wrappers over the
resilient ingest client (retries/backoff, but not on 404, so the
season-boundary 404s still surface fast — see fpl.data.ingest.client).

The client module is looked up at call time (``client.get_entry``) rather than
binding the functions at import, so tests can stub the network at the client
seam.

In demo mode (env var DEMO_MODE=1), both functions bypass the network
entirely and return the same fixed squad for every team_id - see fpl.demo.data.
"""
from fpl.config import get_settings
from fpl.data.ingest import client
from fpl.demo.data import demo_entry_info, demo_entry_picks


def fetch_entry_info(team_id):
    """Live lookup of a manager's basic info (name, points, current_event, etc)."""
    if get_settings().demo_mode:
        return demo_entry_info(team_id)
    return client.get_entry(team_id)


def fetch_entry_picks(team_id, event):
    """Live lookup of a manager's 15 picks for a specific (locked) gameweek."""
    if get_settings().demo_mode:
        return demo_entry_picks(team_id, event)
    return client.get_entry_picks(team_id, event)
