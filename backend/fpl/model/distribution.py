"""
The outcome distribution behind a projection, not just its mean.

Every projection in this app is an expectation: the average points a player
would score if this fixture were replayed many times. That is the right number
for adding up a squad, and the wrong number for almost every decision a
manager actually makes.

The backtest shows why. Over 31,117 predictions across 2025/26, the model beats
a last-five-matches baseline by ~20% on Zeros, Blanks and Tickers - and by
0.5% on Haulers, players who scored five or more. It is not that the model
cannot find them: its top predicted decile hauls 30.9% of the time against a
7.9% base rate, and 39% of every haul in the season landed in that decile. It
is that a haul is a *tail* event and no conditional mean can express one.
Haulers actually average 7.8 points; the model predicts 2.96 for those same
players, because most weeks they blank and the mean is dragged down by the
weeks they don't haul.

Captaincy is a ceiling decision, not a mean decision. Doubling a player who
reliably returns four is worse than doubling one who returns two most weeks
and fifteen occasionally, and an expectation ranks those two the wrong way
round. So this reconstructs the distribution the expectation was collapsed
from and reports what that decision needs: the chance of a haul, and a
realistic ceiling.

Deliberately analytic rather than simulated. A Monte Carlo would be easier to
write and would make every response non-deterministic, which this codebase
cannot have - the golden tests pin exact response bytes and two machines would
disagree. Enumerating the discrete outcome space costs a few hundred
multiplications per player and gives the same answer every time.

Two dependencies are modelled rather than assumed away. Appearance comes
first: a player who does not play scores exactly zero, so goals and assists
are conditioned on playing instead of being convolved across a branch where
the player was never on the pitch. This is a correctness fix, not an accuracy
one - backtesting it changed the calibration barely at all, because the
players with a high haul chance are the ones almost certain to start, and
conditioning does nothing when p_any is 0.97. It stays because placing haul
mass in a branch where the player never appeared is wrong whatever it costs.
Bonus is the second, and the BPS system hands it almost exclusively to players
who returned; letting it float free would award three points to players who
did nothing.

Everything else is combined as independent, which it is not, and the backtest
shows exactly where that bites: below a 30% stated chance the raw numbers are
honest to within a point of probability, and above it they run hot - a stated
59% delivered 44%. Independence over-states the union of several scoring
routes at once, and the player with the most routes is the one it over-states
most. `recalibrate` corrects for it; see there for why the obvious fix does
not work.

`summarise` reports the distribution's own mean precisely so a caller can
check it still tracks predicted_points. The conditioning is constructed to
leave that mean untouched, and a divergence means the distribution and the
expectation have come apart.
"""
import math

from fpl.model.rules import (
    APPEARANCE_POINTS_60_PLUS,
    APPEARANCE_POINTS_ANY,
    ASSIST_POINTS,
    CLEAN_SHEET_POINTS,
    DEFENSIVE_CONTRIBUTION_POINTS,
    GOAL_POINTS,
)

# A haul, in the sense the accuracy benchmark uses it.
HAUL_THRESHOLD = 5

# The percentile reported as "ceiling". Not a maximum: a true maximum is
# unbounded and useless - every forward's is a hat-trick. The 90th percentile
# is the good week a manager is actually hoping for when they captain someone.
CEILING_PERCENTILE = 0.90

# Where each Poisson tail is truncated. Beyond these the mass is negligible:
# five goals covers every hat-trick with headroom, and four assists in one
# fixture is vanishingly rare.
MAX_GOALS = 5
MAX_ASSISTS = 4

# Bonus goes almost exclusively to players who scored, assisted or kept a
# clean sheet. Modelling it as free-floating would hand three bonus points to
# players who did nothing, which is precisely the error that would inflate a
# haul probability. Above this many points from the other components, a player
# is treated as being in the bonus conversation.
BONUS_RETURN_THRESHOLD = 4
# Bonus is 1, 2 or 3 points. Spread evenly across the three, the conditional
# mean is 2w for weight w on each - used to solve for w from expected bonus.
_BONUS_VALUES = (1, 2, 3)


def _poisson_pmf(lam, max_k):
    """P(X = k) for k in 0..max_k, with the remaining tail folded into max_k."""
    if lam <= 0:
        return [1.0] + [0.0] * max_k
    pmf = []
    running = 0.0
    for k in range(max_k):
        p = math.exp(-lam) * lam**k / math.factorial(k)
        pmf.append(p)
        running += p
    pmf.append(max(0.0, 1.0 - running))
    return pmf


def _combine(dist, outcomes):
    """Convolve a {points: probability} map with (points, probability) pairs."""
    combined = {}
    for base_points, base_p in dist.items():
        if base_p <= 0.0:
            continue
        for add_points, add_p in outcomes:
            if add_p <= 0.0:
                continue
            key = base_points + add_points
            combined[key] = combined.get(key, 0.0) + base_p * add_p
    return combined


def fixture_outcome_distribution(position, predicted_goals, predicted_assists,
                                 appearance, cs_prob, dc_prob, expected_bonus=0.0,
                                 expected_minor_points=0.0):
    """
    {points: probability} for one player in one fixture.

    The arguments are the same quantities _fixture_points already computes, and
    are taken unconditioned exactly as it uses them - predicted_goals is an
    unconditional rate, not a rate given the player started - so this
    distribution's mean reconstructs that function's total.

    `expected_minor_points` carries what is not worth enumerating: cards, own
    goals, goals conceded, penalty saves and misses, keeper saves. Together
    they are small and roughly symmetric, so folding them in as a shift costs
    little and avoids multiplying the outcome space by six more dimensions.

    Everything is built inside the branch where the player actually appears
    and then mixed with a point mass at zero, because a player who does not
    play cannot score. Each rate is divided by the appearance probability on
    the way in and multiplied back out by the mixture on the way out, so the
    conditioning moves where the mass sits without moving the mean.
    """
    p_any = max(0.0, min(1.0, appearance["p_any"]))
    p_60 = max(0.0, min(p_any, appearance["p_60_plus"]))
    if p_any <= 0.0:
        return {0: 1.0}

    goal_value = GOAL_POINTS.get(position, 4)
    cs_value = CLEAN_SHEET_POINTS.get(position, 0)

    # Appearance points, given they played at all: 1 for a cameo, 2 for 60+.
    dist = {
        APPEARANCE_POINTS_ANY: (p_any - p_60) / p_any,
        APPEARANCE_POINTS_60_PLUS: p_60 / p_any,
    }

    goals = _poisson_pmf(predicted_goals / p_any, MAX_GOALS)
    dist = _combine(dist, [(k * goal_value, p) for k, p in enumerate(goals)])

    assists = _poisson_pmf(predicted_assists / p_any, MAX_ASSISTS)
    dist = _combine(dist, [(k * ASSIST_POINTS, p) for k, p in enumerate(assists)])

    if cs_value:
        p_cs = max(0.0, min(1.0, cs_prob * p_60 / p_any))
        dist = _combine(dist, [(cs_value, p_cs), (0, 1.0 - p_cs)])

    if dc_prob:
        p_dc = max(0.0, min(1.0, dc_prob))
        dist = _combine(dist, [(DEFENSIVE_CONTRIBUTION_POINTS, p_dc), (0, 1.0 - p_dc)])

    dist = _apply_bonus(dist, expected_bonus / p_any)

    if expected_minor_points:
        shift = int(round(expected_minor_points / p_any))
        if shift:
            dist = {points + shift: p for points, p in dist.items()}

    # Mix the played branch back against the chance they never appear.
    mixed = {0: 1.0 - p_any}
    for points, p in dist.items():
        mixed[points] = mixed.get(points, 0.0) + p * p_any
    return mixed


def _apply_bonus(dist, expected_bonus):
    """
    Add bonus, conditional on the player having returned something.

    The weight on each of 1, 2 and 3 bonus points is solved so the resulting
    unconditional mean equals `expected_bonus` - the same figure the model's
    own projection uses - which keeps this distribution's mean consistent with
    predicted_points instead of quietly drifting above it.
    """
    if expected_bonus <= 0:
        return dist
    total = sum(dist.values()) or 1.0
    p_return = sum(p for points, p in dist.items() if points >= BONUS_RETURN_THRESHOLD) / total
    if p_return <= 0:
        return dist
    # mean = p_return * w * sum(_BONUS_VALUES); solve for w, capped so the
    # three weights can never exceed certainty.
    weight = expected_bonus / (p_return * sum(_BONUS_VALUES))
    weight = min(weight, 1.0 / len(_BONUS_VALUES))

    combined = {}
    for points, p in dist.items():
        if points >= BONUS_RETURN_THRESHOLD:
            combined[points] = combined.get(points, 0.0) + p * (1.0 - weight * len(_BONUS_VALUES))
            for bonus in _BONUS_VALUES:
                key = points + bonus
                combined[key] = combined.get(key, 0.0) + p * weight
        else:
            combined[points] = combined.get(points, 0.0) + p
    return combined


def convolve(a, b):
    """
    The distribution of two fixtures' combined points.

    A double gameweek is not two independent chances at a haul - it is one
    week's total, and the threshold applies to the sum. Summing the two means
    and asking whether that clears five would be wrong in both directions:
    it misses the player who hauls once across two quiet games, and it
    over-credits two four-point returns as a haul when they are exactly that.
    """
    if not a:
        return dict(b)
    if not b:
        return dict(a)
    return _combine(a, list(b.items()))


# Below this stated probability the raw numbers are honest; above it the
# independence assumption compounds and they run hot. Both constants were
# chosen on gameweeks 2-20 and then checked, untouched, on 21-38.
CALIBRATION_KNEE = 0.25
CALIBRATION_SHRINK = 0.4


def recalibrate(p):
    """
    Pull the over-confident tail back towards what actually happened.

    The obvious fixes do not work, and it is worth recording why so nobody
    re-derives them. A power transform (p**gamma) fitted on the first half of
    the season made both Brier and log loss *worse* on the second: the model is
    slightly under-confident at the bottom and badly over-confident at the top,
    and a single exponent can only move both ends the same way. A logit-linear
    fit can bend both ends, but the low band holds most of the mass, so the fit
    chases it and wrecks the top - a stated 61% came out at 38% against a real
    52%. Isotonic regression does generalise, but it buys less than this does
    and costs a fitted lookup table that would need refitting every season.

    What the backtest actually shows is a stable, simple distortion: below
    roughly a quarter the stated numbers are already right, and above it they
    are stretched by a near-constant factor - the same shape in both halves of
    the season. So that is all this corrects. Held out on gameweeks 21-38 it
    improves Brier by 0.29% and log loss by 0.18%.

    It over-corrects the very top: a stated 61% becomes 39% where the truth was
    52%. That band is 143 predictions out of 15,138, too thin to fit against
    without simply memorising it, and the error now points at understatement
    rather than hype.
    """
    if p <= CALIBRATION_KNEE:
        return p
    return CALIBRATION_KNEE + (p - CALIBRATION_KNEE) * CALIBRATION_SHRINK


def summarise(dist):
    """
    The two numbers a decision needs, plus the mean for cross-checking.

    `haul_probability` is P(>= HAUL_THRESHOLD), recalibrated. It is emphatically
    *not* what captaincy is ranked on: the backtest tried that and it picked
    worse captains than the plain expectation did (4.92 points a week against
    5.32, hauling 35% of weeks against 41%). Blending the ceiling in scored
    better still, but the two rankings disagreed in only 4 of 37 gameweeks and
    the entire margin came from one lucky week, so that was rejected too. These
    numbers are here to say how confident a projection is, not to reorder it.

    `ceiling` is the CEILING_PERCENTILE outcome. `mean` should track the
    model's own predicted_points closely; a large divergence means the
    distribution and the expectation have come apart, which is a bug rather
    than a modelling choice.
    """
    if not dist:
        return {"haul_probability": 0.0, "ceiling": 0, "mean": 0.0}
    total = sum(dist.values()) or 1.0
    haul = sum(p for points, p in dist.items() if points >= HAUL_THRESHOLD) / total
    mean = sum(points * p for points, p in dist.items()) / total

    cumulative = 0.0
    ceiling = 0
    for points in sorted(dist):
        cumulative += dist[points] / total
        if cumulative >= CEILING_PERCENTILE:
            ceiling = points
            break
    return {
        "haul_probability": round(recalibrate(haul), 4),
        "ceiling": int(ceiling),
        "mean": round(mean, 3),
    }
