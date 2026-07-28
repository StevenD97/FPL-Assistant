"""
Experiment: does blending team-strength training (compute_team_goal_strengths)
toward team-aggregated expected goals instead of pure actual goals improve
walk-forward accuracy? Same motivation, and same evidence-based process, as
SHARE_SMOOTHING_ALPHA's grid search in tune.py - actual goals are a
small-integer outcome count that bakes in finishing variance; xG (summed
per-player expected_goals from gw_history) is Opta's own chance-quality
estimate and should be more stable game to game. See
compute_team_goal_strengths' xg_weight docstring for the mechanics.

Sweeps xg_weight in [0.0 .. 1.0] on the tune.py-style sampled grid first
(cheap), then re-runs the FULL GW2-38 backtest on whichever value wins, to
confirm the result holds up out of sample rather than just fitting the
sampled weeks.

Run with: python -m tools.eval.experiment_team_xg  (from the backend/ folder)
"""
import sys

import pandas as pd

from tools.eval.backtest import MAX_GW, MIN_GW, run_backtest, summarize

XG_WEIGHT_GRID = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
GW_STEP = 3


def search(xg_weight_grid=XG_WEIGHT_GRID, gw_step=GW_STEP):
    sample_gws = list(range(MIN_GW, MAX_GW + 1, gw_step))
    print(f"Searching {len(xg_weight_grid)} xg_weight values against GW{sample_gws} ({len(sample_gws)} weeks)...\n")

    results = []
    for xg_weight in xg_weight_grid:
        per_gw, compiled = run_backtest(xg_weight=xg_weight, gameweeks=sample_gws)
        pearson_r = compiled["predicted_points"].corr(compiled["actual_points"])
        spearman_r = compiled["predicted_points"].rank().corr(compiled["actual_points"].rank())
        mae = compiled["error"].abs().mean()
        results.append({
            "xg_weight": xg_weight, "pearson_r": pearson_r, "spearman_r": spearman_r,
            "mae": mae, "top20_precision": per_gw["top20_precision"].mean(),
        })
        print(f"  xg_weight={xg_weight:.1f}  pearson_r={pearson_r:.4f}  spearman_r={spearman_r:.4f}  "
              f"mae={mae:.4f}  top20_precision={per_gw['top20_precision'].mean():.4f}")

    return pd.DataFrame(results)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", 200)

    grid_results = search()
    print("\n=== Full grid (search sample only) ===")
    print(grid_results.round(4).to_string(index=False))

    best = grid_results.sort_values("pearson_r", ascending=False).iloc[0]
    best_xg_weight = float(best["xg_weight"])
    print(f"\nBest on the search sample by pearson_r: xg_weight={best_xg_weight}. "
          f"Confirming against the FULL GW{MIN_GW}-{MAX_GW} backtest...\n")

    best_per_gw, best_compiled = run_backtest(xg_weight=best_xg_weight)
    print(f"=== xg_weight={best_xg_weight} on the FULL backtest ===")
    summarize(best_per_gw, best_compiled)

    print(f"\n=== For comparison, current production default (xg_weight=0.0) on the FULL backtest ===")
    default_per_gw, default_compiled = run_backtest(xg_weight=0.0)
    summarize(default_per_gw, default_compiled)
