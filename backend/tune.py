"""
Grid search over team_model.py's half_life_days and SHRINKAGE_GAMES,
scored against backtest.py's walk-forward accuracy - the "keep trying
different models until we have a good level of confidence" step.

Searches on a sampled subset of gameweeks (every GW_STEP-th week) to
keep the grid affordable, then re-runs the FULL GW2-38 backtest on the
best combination found, to confirm the result holds up out of sample
rather than just being the best fit to the sampled weeks.

Run with: venv\\Scripts\\python.exe tune.py
"""

import sys

import pandas as pd

from backtest import MAX_GW, MIN_GW, run_backtest, summarize

HALF_LIFE_GRID = [7, 14, 21, 30, 45, 60]
SHRINKAGE_GRID = [1, 2, 3, 5, 8, 15]
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
