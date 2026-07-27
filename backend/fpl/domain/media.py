"""
Official Premier League CDN image URLs — team badges, kits, and player photos.

The exact URLs the FPL site itself uses, built from `team.code`/`element.code`
(stable across seasons, unlike `id` — see fpl.model.ids.map_player_stats_to_roster).
No API key, no scraping — these are public static assets.
"""
from fpl.config import FPL_STATIC_BASE, PL_RESOURCES_BASE


def team_badge_url(team_code, size=70):
    """size: one of Premier League's served sizes - 25/40/50/70/100/110/250 are known to exist."""
    return f"{PL_RESOURCES_BASE}/badges/{size}/t{team_code}.png"


def team_kit_url(team_code):
    """The standard (home) kit icon - away/third/GK kits exist too but aren't wired up here."""
    return f"{FPL_STATIC_BASE}/shirts/standard/shirt_{team_code}-66.png"


def team_badge_by_short_name(bootstrap, size=70):
    """
    {team_short_name: badge_url} - for endpoints that only have a team's
    3-letter short name in scope by the time badges get attached (e.g.
    after a groupby/merge already collapsed down to team_short, with the
    numeric bootstrap team id no longer around), rather than team_badge_url's
    usual numeric team_code. short_name is unique within one bootstrap
    snapshot, same as id - safe to key on.
    """
    return {t["short_name"]: team_badge_url(t["code"], size) for t in bootstrap["teams"]}


def player_photo_url(player_code, size="110x140"):
    """
    size: "110x140" (FPL's own default headshot crop) or "250x250" (larger).
    Default is "110x140" - verified directly against the live CDN across the
    full 2026/27 roster: every player with a 250x250 image also has a
    110x140 one, but not vice versa (19 players, e.g. Virgil van Dijk,
    250x250s a 403 while 110x140 200s - an older/legacy photo only cropped
    at the smaller size). 110x140 is strictly equal-or-better coverage, and
    the app never renders these above ~80px, so there's no visible quality
    cost. The ~1/3 of players with no photo at either size (younger/lesser-
    known players PL hasn't shot yet) degrade gracefully via each caller's
    onError handler - nothing fixes those short of PL adding the photo.
    """
    return f"{PL_RESOURCES_BASE}/photos/players/{size}/p{player_code}.png"
