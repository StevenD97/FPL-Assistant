"""
Official Premier League CDN image URLs — team badges, kits, and player photos.

The exact URLs the FPL site itself uses, built from `team.code`/`element.code`
(stable across seasons, unlike `id` — see fpl.model.ids.map_player_stats_to_roster).
No API key, no scraping — these are public static assets.
"""
from fpl.config import FPL_STATIC_BASE, PL_PHOTOS_BASE, PL_RESOURCES_BASE

# The position value that gets a keeper kit rather than the outfield one. Every
# row in this app that carries a kit URL also carries GKP/DEF/MID/FWD.
GOALKEEPER = "GKP"


def team_badge_url(team_code, size=70):
    """size: one of Premier League's served sizes - 25/40/50/70/100/110/250 are known to exist."""
    return f"{PL_RESOURCES_BASE}/badges/{size}/t{team_code}.png"


def team_kit_url(team_code, position=None):
    """
    The team's standard kit icon, outfield or goalkeeper.

    FPL serves the keeper kit as a `_1` variant of the same team code, and it is
    a genuinely different image (a side's keeper almost never wears the outfield
    shirt). Passing `position` is optional only so that a caller with no position
    in scope still gets the outfield kit rather than an exception; every caller
    inside this app has it, because every row that carries a kit also carries
    GKP/DEF/MID/FWD.

    Away/third kits exist too but aren't wired up - which strip a side wears in a
    given fixture isn't in the bootstrap, so picking one would be a guess.
    """
    suffix = "_1" if position == GOALKEEPER else ""
    return f"{FPL_STATIC_BASE}/shirts/standard/shirt_{team_code}{suffix}-66.png"


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
    A player's headshot, in the kit of the club he plays for now.

    The bucket matters more than the size here. Premier League runs two photo
    buckets, and the older one (`/premierleague/photos/players/<size>/p<code>.png`,
    with a `p` prefix on the filename) has not been refreshed for this season:
    swept across the full 2026/27 roster, its images carry last-modified dates
    from 2023 and 2024, so a player who moved in the summer is served in his
    previous club's shirt. That is the "why is he still in an Everton kit"
    complaint, and no amount of cache-busting fixes it - the bytes at that URL
    really are last season's photo.

    The current bucket is `/premierleague25/photos/players/<size>/<code>.png` -
    no `p` prefix - and it is both fresher and wider:

        in current bucket   561 / 626    (photos dated Aug 2026)
        in legacy bucket    390 / 626    (photos dated 2023-2024)
        current only        192          gains a photo it never had
        legacy only          21          loses one, falls back to initials
        neither              44

    The 21 losses are deliberate rather than regrettable: thirteen of them
    changed clubs in the summer, so the legacy photo we would be falling back to
    is precisely the wrong-kit image, and the initials avatar PlayerPhoto.tsx
    renders instead is at least honest. The 192 gains include several of the
    most-owned players in the game (Cherki 18.9%, Lammens 14.9%, Wirtz 10.7%),
    all of whom previously showed initials.

    size: "110x140" is the only crop the current bucket serves - 250x250 and the
    square crops 403 there. The app never renders these above ~80px, so there is
    no visible cost.
    """
    return f"{PL_PHOTOS_BASE}/photos/players/{size}/{player_code}.png"
