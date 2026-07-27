"""
Shared orchestration helpers used across several services: resolving the
per-request gameweek defaults, and attaching CDN media URLs to result rows.
"""
from datetime import datetime
from typing import Optional

from fpl.domain.gameweek import get_gw_context
from fpl.domain.media import player_photo_url, team_badge_url, team_kit_url


def resolve_gw_params(reference_date: Optional[str], next_event: Optional[int]):
    """
    Resolves an endpoint's reference_date/next_event query params against the
    live gameweek context (see fpl.domain.gameweek.get_gw_context) when the
    caller doesn't pass them explicitly - a per-request dynamic default instead
    of a frozen calendar literal that goes stale every gameweek. A caller can
    still override either one via querystring (e.g. to reproduce a specific
    past prediction), which is why every endpoint keeps these Optional.
    """
    ctx = get_gw_context()
    ref_date = datetime.strptime(reference_date, "%Y-%m-%d") if reference_date else ctx["reference_date"]
    event = next_event if next_event is not None else ctx["next_event"]
    return ref_date, event


def attach_player_media(rows, team_code_by_id):
    """
    Adds team_badge/team_kit/player_photo to each row dict (in place) using its
    'team' (numeric team id) and 'code' (player element code) fields, then drops
    those two raw fields - see fpl.optimize.squad's _extract_result, which
    includes them in its output for exactly this purpose.
    """
    for row in rows:
        team_id_num = row.pop("team")
        code = row.pop("code")
        row["team_badge"] = team_badge_url(team_code_by_id[team_id_num])
        row["team_kit"] = team_kit_url(team_code_by_id[team_id_num])
        row["player_photo"] = player_photo_url(code)
    return rows
