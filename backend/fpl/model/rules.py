"""
FPL 2025/26 scoring rules and calibration constants, plus the small Poisson
helpers the points model is built on. Pure — no data access, no other
fpl.model dependencies (verified against fantasyfootballscout.co.uk's rules
writeup — see fpl.model.predict's module docstring).
"""
import math

GOAL_POINTS = {"GKP": 10, "DEF": 6, "MID": 5, "FWD": 4}
ASSIST_POINTS = 3
CLEAN_SHEET_POINTS = {"GKP": 4, "DEF": 4, "MID": 1, "FWD": 0}
GOALS_CONCEDED_PENALTY = -1  # per 2 goals conceded, GKP/DEF only
GOALS_CONCEDED_DIVISOR = 2
APPEARANCE_POINTS_ANY = 1
APPEARANCE_POINTS_60_PLUS = 2  # total for 60+, not additive on top of APPEARANCE_POINTS_ANY
SAVE_POINTS = 1
SAVE_DIVISOR = 3
PENALTY_SAVE_POINTS = 5
PENALTY_MISS_POINTS = -2
YELLOW_CARD_POINTS = -1
RED_CARD_POINTS = -3
OWN_GOAL_POINTS = -2
DEFENSIVE_CONTRIBUTION_THRESHOLD = {"DEF": 10, "MID": 12, "FWD": 12}  # none for GKP
DEFENSIVE_CONTRIBUTION_POINTS = 2

# Flat, hand-calibrated involvement-share boosts for a *current* primary
# set-piece taker - gw_history-derived goal_share/assist_share can't see a
# duty change until goals/assists from it actually accumulate in the
# archive. Same spirit as recommendation_score's set-piece bonus constants
# in fpl.domain.scoring, adapted to the model's share-based (not points-based)
# scoring. Only applied when apply_live_signals=True - see predict_player_points.
PENALTY_TAKER_GOAL_SHARE_BOOST = 0.08
FREEKICK_TAKER_GOAL_SHARE_BOOST = 0.03
CORNER_TAKER_ASSIST_SHARE_BOOST = 0.04

DEFAULT_TEAM_STRENGTH = {"attack_home": 1.0, "attack_away": 1.0, "defence_home": 1.0, "defence_away": 1.0}

# Promoted teams (no name match anywhere in the training archive - e.g.
# Coventry/Hull/Ipswich coming into 2026/27) get this discounted prior
# instead of DEFAULT_TEAM_STRENGTH's neutral 1.0 - assuming a newly-
# promoted side is exactly league-average overstates them: they spent last
# season beating weaker Championship opposition, and that output doesn't
# translate directly into the Premier League. These are rough, commonly-
# cited Premier League figures (promoted teams have historically
# underperformed a neutral prior by roughly this much in their first
# season back), NOT calibrated against this app's own backtest - there's
# no historical multi-season archive here to validate the exact numbers
# against. Revisit once real 2026/27 results exist for the promoted sides
# (see README's season-transition notes).
PROMOTED_TEAM_ATTACK_DISCOUNT = 0.85  # <1.0 = below-average scoring
PROMOTED_TEAM_DEFENCE_PENALTY = 1.15  # >1.0 = leakier defence
PROMOTED_TEAM_STRENGTH = {
    "attack_home": PROMOTED_TEAM_ATTACK_DISCOUNT,
    "attack_away": PROMOTED_TEAM_ATTACK_DISCOUNT,
    "defence_home": PROMOTED_TEAM_DEFENCE_PENALTY,
    "defence_away": PROMOTED_TEAM_DEFENCE_PENALTY,
}

# How many "pseudo-games" worth of trust in the league average to blend into a
# team's attack/defence ratios - see _shrink_ratio. Higher = more conservative
# (needs more games before trusting a team-specific ratio over the average).
SHRINKAGE_GAMES = 3

# Additive (Dirichlet/Laplace-style) smoothing for compute_player_involvement_shares,
# in units of recency-weighted team xG/xA (added once, toward a position-average
# prior share - see that function's docstring). Solves a problem team-level
# strengths above never had (_shrink_ratio already regularizes those): an
# established, heavily-used player's share of their own team's output had NO
# regularization at all - found via a live-app report that the model had Bruno
# Fernandes on 2.0 predicted goals and 4.2 predicted assists over a 5-gameweek
# window, traced back to a recency-weighted assist_share of 0.505 (half of Man
# Utd's *entire* modeled assist output credited to one player), off a real
# season where he had 24 of the team's 60 actual assists (40%) even before
# recency-weighting toward a strong finish pushed it higher still. No real
# single player sustains that. Higher = more conservative (pulls harder toward
# what's typical for the player's position). Picked via a grid search against
# backtest.py's walk-forward accuracy: alpha=0 (xG/xA alone, no smoothing)
# already fixes most of the systematic bias (best MAE, best Spearman r, ~zero
# DEF bias) but has the *worst* top-20 precision of the grid; increasing alpha
# steadily trades a little MAE/Spearman/bias for a meaningfully better top-20
# precision (0.119 -> 0.135, the metric closest to "would this have helped
# pick a captain/differential" - see backtest.py's docstring) up to about
# alpha=0.5-0.75, where it plateaus and DEF bias keeps climbing past that
# point with no further top-20 benefit. 0.5 is the low end of that plateau -
# the least aggressive smoothing that still captures the top-20 gain.
SHARE_SMOOTHING_ALPHA = 0.5

# Minimum recency-weighted appearance evidence (sum of per-fixture weight,
# see recency_weights) for a player to count toward their position's average
# share when building compute_player_involvement_shares' smoothing prior -
# without this, a debutant's single substitute appearance (~0 raw share,
# nothing to show for it yet) would drag the whole position's "typical"
# share down for everyone, including established players. Set well below a
# single full match's weight (~1.0 at zero days ago) so a player only needs
# a handful of appearances, not a long track record, to count.
MIN_APPEARANCE_WEIGHT_FOR_POSITION_PRIOR = 0.5

# half_life_days for predicting a brand-new season from the prior season's
# archive (no gw_history for the new season exists yet to train on) - the
# default half_life_days=21 is tuned for within-season recency (weeks
# apart), and decays a ~90-day close-season gap to near-zero weight,
# collapsing _shrink_ratio's confidence toward every team looking equally
# average (empirically: spread across teams' attack_home ratios drops from
# ~0.52 in-season to ~0.04 at half_life=21 across a 90-day gap). 90 days
# was chosen by matching the resulting cross-season spread/rank-correlation
# back against the in-season, end-of-prior-season baseline (spread ~0.50,
# Spearman ~0.81 - see README for the numbers).
CROSS_SEASON_HALF_LIFE_DAYS = 90

# Personal-history stats pulled via compute_recency_weighted_stat - every
# category that isn't derivable from the Stage 1 team-goals model.
HISTORY_STAT_COLUMNS = [
    "bonus", "saves", "penalties_saved", "penalties_missed",
    "yellow_cards", "red_cards", "own_goals", "defensive_contribution",
]


def _poisson_pmf(k, lam):
    return math.exp(-lam) * lam ** k / math.factorial(k)


def _poisson_prob_at_least(lam, threshold, max_k=60):
    """P(X >= threshold) for X ~ Poisson(lam)."""
    if threshold <= 0:
        return 1.0
    return max(0.0, 1 - sum(_poisson_pmf(k, lam) for k in range(threshold)))


def _poisson_expected_floor_division(lam, divisor, max_k=60):
    """E[floor(X/divisor)] for X ~ Poisson(lam) - used for saves and goals conceded penalties."""
    return sum(_poisson_pmf(k, lam) * (k // divisor) for k in range(max_k + 1))
