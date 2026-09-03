# Should we replace our model with OpenFPL?

**Decision: no, not wholesale — but it names our weakness precisely, and we should
take the diagnosis.**

The advice we were given was blunt: OpenFPL is open source, peer-reviewed, and
matches the commercial leader, so building your own worse model is not a
differentiator — take the free one and compete on the layer above it. That is a
good argument and it deserved a real answer rather than a defensive one. Here is
the answer.

## The comparison

OpenFPL ([arXiv 2508.09992](https://arxiv.org/abs/2508.09992),
[github.com/daniegr/OpenFPL](https://github.com/daniegr/OpenFPL), MIT) reports
RMSE by return category against the same Last-5 baseline we now publish, which
makes the two measurable against each other. Neither figure is measured on the
same games — theirs is gameweeks 32-38 of 2024/25, ours is all 38 gameweeks of
2025/26, 31,117 predictions — so the absolute numbers are not comparable. The
gain over each model's own baseline is.

| Category | xFPL | OpenFPL | FPL Review (commercial) |
|---|---|---|---|
| Zeros | **−19.8%** | +3.4% | −12.9% |
| Blanks | **−23.6%** | −7.8% | −15.1% |
| Tickers | −19.7% | **−29.0%** | −25.4% |
| Haulers | −0.5% | **−8.4%** | −7.9% |

Negative is better. Read it honestly and it says two things at once.

We are the best of the three at knowing who will not return — and that is not
the achievement it looks like, because Zeros and Blanks are 87% of all
predictions and the easiest thing in the problem. OpenFPL is actually *worse
than doing nothing* on Zeros, and does not care, because Zeros do not win
gameweeks.

And we are last on both categories that do. Haulers is the row that matters, and
a −0.5% edge over "average their last five games" is, in practice, no edge at
all. Both of the others are around −8%. That is the gap, stated as plainly as
the data allows.

## Why we are not adopting it anyway

Four reasons, in descending order of how much they actually matter.

**The weights are fitted to a scoring system that no longer exists.** OpenFPL
was developed on 2020-21 through 2023-24 and evaluated on 2024-25. Defensive
contribution points arrived in 2025/26 and are now a real and regular source of
returns for defenders and defensive midfielders — our model prices them
explicitly. A regressor trained before that rule cannot know about it, and the
error lands hardest on exactly the players the rule was written to reward. The
paper also models "assistant managers" as its own position, a role that has
since gone. Both are the same fact: the target moved after the model was fitted.

**Swapping would be a regression across 87% of predictions.** We would trade a
19.8% and 23.6% advantage on Zeros and Blanks for OpenFPL's +3.4% and −7.8%, to
buy roughly 8% on Haulers. On pooled error that is a straightforward loss. It
might still be worth it — Haulers decide gameweeks and pooled error does not —
but it is a trade, not an upgrade, and it should be argued as one.

**It needs a second data source.** OpenFPL's features include Understat xG, xA,
deep completions and PPDA. We are FPL-API-only today, which is why our ingest is
one cron and one snapshot. Adding a scraped source adds a failure mode to every
projection on the site.

**It does not fit the deployment.** 196-206 features per position, XGBoost plus
Random Forest ensembles, pickled weights. This codebase declined to add scipy —
about 90MB — for a single correlation coefficient, and computes Spearman by hand
instead. XGBoost and scikit-learn together are several times that on a free tier
already tight on build time and disk. Pickled tree ensembles are also version-
fragile, and every route response here is pinned byte-for-byte by golden tests.

## What we are taking instead

The diagnosis, which is worth more than the artifact.

Both OpenFPL and the commercial benchmark beat us on the high-return tail while
we beat them on the low end. That is a signature, not a coincidence: our model
is a well-calibrated conditional mean, and a conditional mean is structurally
unable to express a tail event. It is the same finding the backtest reached
independently — the model's top predicted decile hauls 30.9% of the time against
a 7.9% base rate, so the *ranking* is good, while haulers average 7.8 points
against a 2.96 prediction, so the *magnitude* is compressed.

Two things follow, and both are now in the codebase:

- `fpl/model/distribution.py` reconstructs the outcome distribution behind each
  projection, so a haul can be expressed as a probability and a ceiling rather
  than smeared into a mean that can never reach it.
- `fpl/domain/baseline.py` makes the Last-5 comparison permanent and public, so
  the Haulers row cannot quietly stop being embarrassing without someone noticing.

The honest position is that OpenFPL is better than us at the part of this problem
that matters most, we know why, and we have not closed it yet. That belongs on
the record rather than in a drawer.

## When to revisit

- If OpenFPL is retrained on 2025/26 or later, the strongest objection goes away
  and this should be re-run rather than re-argued.
- If our Haulers figure has not moved materially by the end of 2026/27, the trade
  above stops being a close call.
- A middle path we have not tested: keep our model for availability and the low
  end, and use a Haulers-specific model for the tail. That is more work than
  swapping and it needs the swap evaluated first to be worth proposing.
