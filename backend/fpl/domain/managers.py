"""
Head coach per club, 2026/27 season - not published anywhere in the FPL API
(bootstrap-static has no manager field), so maintained here by hand and
keyed by team code (stable across seasons/re-IDs, same key used for badges
and player photos - see fpl.domain.media). Update each summer, and
mid-season if a club changes manager.
"""

MANAGER_BY_TEAM_CODE = {
    3: "Mikel Arteta",  # Arsenal
    7: "Unai Emery",  # Aston Villa
    91: "Marco Rose",  # Bournemouth
    94: "Keith Andrews",  # Brentford
    36: "Fabian Hurzeler",  # Brighton
    8: "Xabi Alonso",  # Chelsea
    9: "Frank Lampard",  # Coventry City
    31: "Pierre Sage",  # Crystal Palace
    11: "David Moyes",  # Everton
    54: "Alvaro Arbeloa",  # Fulham
    88: "Sergej Jakirovic",  # Hull City
    40: "Gary O'Neil",  # Ipswich Town
    2: "Daniel Farke",  # Leeds United
    14: "Andoni Iraola",  # Liverpool
    43: "Enzo Maresca",  # Man City
    1: "Michael Carrick",  # Man Utd
    4: "Eddie Howe",  # Newcastle
    17: "Oliver Glasner",  # Nottingham Forest
    56: "Regis Le Bris",  # Sunderland
    6: "Roberto De Zerbi",  # Tottenham
    # Not in the 2026/27 top flight (relegated/replaced by the promoted
    # three above) - kept so a stale on-disk snapshot (e.g. a DB-unreachable
    # fallback that hasn't refreshed past 2025/26 yet) doesn't show a blank
    # manager for these three if it's ever the one actually being served.
    90: "Scott Parker",  # Burnley
    21: "Nuno Espirito Santo",  # West Ham
    39: "Rob Edwards",  # Wolves
}


def manager_name(team_code):
    return MANAGER_BY_TEAM_CODE.get(team_code)
