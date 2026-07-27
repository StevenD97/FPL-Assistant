"""
Grid search over team_model.py's tunable constants, scored against
backtest.py's walk-forward accuracy - the "keep trying different models
until we have a good level of confidence" step.

Two separate searches, not one combined grid - half_life_days/
SHRINKAGE_GAMES (team-level attack/defence strength) and
SHARE_SMOOTHING_ALPHA (individual player involvement-share smoothing,
added later - see team_model.py's comment on it for the Bruno Fernandes
case that motivated it) are close to orthogonal concerns, and a full 3-D
cross product (6x6x8 = 288 backtest runs) would be far slower for little
extra insight over searching each independently against the other's
current default.

Both searches sample a subset of gameweeks (every GW_STEP-th week) to
keep the grid affordable, then re-run the FULL GW2-38 backtest on the
best value(s) found, to confirm the result holds up out of sample rather
than just being the best fit to the sampled weeks.

Run with: python -m tools.eval.tune  (from the backend/ folder)
"""

import sys

import pandas as pd

from tools.eval.backtest import MAX_GW, MIN_GW, run_backtest, summarize

HALF_LIFE_GRID = [7, 14, 21, 30, 45, 60]
SHRINKAGE_GRID = [1, 2, 3, 5, 8, 15]
ALPHA_GRID = [0.0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0]
GW_STEP = 3  # search on every 3rd gameweek to keep the grid affordable


def search(half_life_grid=HALF_LIFE_GRID, shrinkage_grid=SHRINKAGE_GRID, gw_step=GW_STEP):
    sample_gws = list(range(MIN_GW, MAX_GW + 1, gw_step))
    print(f"Searching {len(half_life_grid)}x{len(shrinkage_grid)} combinations "
          f"against GW{sample_gws} ({len(sample_gws)} weeks)...\n")

    results = []
    for half_life_days in half_life_grid:
        for shrinkage_games in shrinkage_grid:
            per_gw, compiled = run_backtest(
                half_life_days=half_life_days, shrinkage_games=shrinkage_games, gameweeks=sample_gws,
            )
            pearson_r = compiled["predicted_points"].corr(compiled["actual_points"])
            spearman_r = compiled["predicted_points"].rank().corr(compiled["actual_points"].rank())
            mae = compiled["error"].abs().mean()
            results.append({
                "half_life_days": half_life_days,
                "shrinkage_games": shrinkage_games,
                "pearson_r": pearson_r,
                "spearman_r": spearman_r,
                "mae": mae,
                "top20_precision": per_gw["top20_precision"].mean(),
            })
            print(f"  half_life_days={half_life_days:>3}  shrinkage_games={shrinkage_games:>2}  "
                  f"pearson_r={pearson_r:.4f}  spearman_r={spearman_r:.4f}  mae={mae:.4f}")

    return pd.DataFrame(results)


def search_alpha(alpha_grid=ALPHA_GRID, gw_step=GW_STEP):
    """
    SHARE_SMOOTHING_ALPHA alone, holding half_life_days/shrinkage_games at
    their own defaults - see module docstring for why this is a separate
    search rather than a third grid dimension. Also reports top20_precision
    and DEF bias (mean predicted-actual for DEF rows) alongside the usual
    pearson/spearman/mae: the value this was actually picked on was
    top20_precision (closest to "would this have helped pick a captain/
    differential" - see backtest.py's docstring), which doesn't move
    monotonically with pearson_r/mae the way the half_life/shrinkage grid
    above does. DEF bias flagged a real bug during development (a first
    attempt at this smoothing used one flat prior across all outfield
    positions, which pulled defenders' correctly-low involvement shares up
    toward attackers' - see team_model.py's docstring on why the prior is
    position-specific instead).
    """
    sample_gws = list(range(MIN_GW, MAX_GW + 1, gw_step))
    print(f"Searching {len(alpha_grid)} alpha values against GW{sample_gws} ({len(sample_gws)} weeks)...\n")

    results = []
    for alpha in alpha_grid:
        per_gw, compiled = run_backtest(smoothing_alpha=alpha, gameweeks=sample_gws)
        pearson_r = compiled["predicted_points"].corr(compiled["actual_points"])
        spearman_r = compiled["predicted_points"].rank().corr(compiled["actual_points"].rank())
        mae = compiled["error"].abs().mean()
        def_bias = compiled[compiled["position"] == "DEF"]["error"].mean()
        results.append({
            "smoothing_alpha": alpha, "pearson_r": pearson_r, "spearman_r": spearman_r,
            "mae": mae, "def_bias": def_bias, "top20_precision": per_gw["top20_precision"].mean(),
        })
        print(f"  alpha={alpha:>4}  pearson_r={pearson_r:.4f}  spearman_r={spearman_r:.4f}  "
              f"mae={mae:.4f}  def_bias={def_bias:+.4f}  top20_precision={per_gw['top20_precision'].mean():.4f}")

    return pd.DataFrame(results)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", 200)

    grid_results = search()

    print("\n=== Top 10 combinations by pearson_r (search sample only) ===")
    print(grid_results.sort_values("pearson_r", ascending=False).head(10).round(4).to_string(index=False))

    best = grid_results.sort_values("pearson_r", ascending=False).iloc[0]
    best_half_life, best_shrinkage = int(best["half_life_days"]), int(best["shrinkage_games"])
    print(f"\nBest on the search sample: half_life_days={best_half_life}, shrinkage_games={best_shrinkage}. "
          f"Confirming against the FULL GW{MIN_GW}-{MAX_GW} backtest...\n")

    best_per_gw, best_compiled = run_backtest(half_life_days=best_half_life, shrinkage_games=best_shrinkage)
    summarize(best_per_gw, best_compiled)

    print(f"\n=== For comparison, current defaults (half_life_days=21, shrinkage_games=3) on the full backtest ===")
    default_per_gw, default_compiled = run_backtest(half_life_days=21, shrinkage_games=3)
    default_pearson = default_compiled["predicted_points"].corr(default_compiled["actual_points"])
    default_spearman = default_compiled["predicted_points"].rank().corr(default_compiled["actual_points"].rank())
    print(f"Pearson r: {default_pearson:.4f} (r^2={default_pearson ** 2:.4f})  "
          f"Spearman r: {default_spearman:.4f}  MAE: {default_compiled['error'].abs().mean():.4f}")

    print("\n\n=== SHARE_SMOOTHING_ALPHA search (see search_alpha()'s docstring) ===")
    alpha_results = search_alpha()
    print("\n=== Full alpha grid (search sample only) ===")
    print(alpha_results.round(4).to_string(index=False))
