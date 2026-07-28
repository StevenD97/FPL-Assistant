"""
Experiment: does dampening appearance probability for a fixture-congested
team (extra scheduled games in the coming week - see
fpl.domain.fixtures.compute_congestion) improve walk-forward accuracy?
Forward-looking fixture *scheduling*, not results, so safe to test in a
backtest without lookahead - see CONGESTION_APPEARANCE_WEIGHT's docstring
in fpl.model.rules for the mechanics and the important caveat: this app's
fixtures.json is Premier-League-only (no European/domestic-cup fixtures),
so this can only ever see PL-vs-PL pileups, not the real driver of most
squad rotation.

Same process as experiment_team_xg.py: a cheap sampled grid first, then the
full GW2-38 backtest on whichever value wins, to confirm out of sample.

Run with: python -m tools.eval.experiment_congestion  (from the backend/ folder)
"""
import sys

import pandas as pd

from tools.eval.backtest import MAX_GW, MIN_GW, run_backtest, summarize

CONGESTION_WEIGHT_GRID = [0.0, 0.05, 0.10, 0.15, 0.20]
GW_STEP = 3


def search(grid=CONGESTION_WEIGHT_GRID, gw_step=GW_STEP):
    sample_gws = list(range(MIN_GW, MAX_GW + 1, gw_step))
    print(f"Searching {len(grid)} congestion_weight values against GW{sample_gws} ({len(sample_gws)} weeks)...\n")

    results = []
    for congestion_weight in grid:
        per_gw, compiled = run_backtest(congestion_weight=congestion_weight, gameweeks=sample_gws)
        pearson_r = compiled["predicted_points"].corr(compiled["actual_points"])
        spearman_r = compiled["predicted_points"].rank().corr(compiled["actual_points"].rank())
        mae = compiled["error"].abs().mean()
        results.append({
            "congestion_weight": congestion_weight, "pearson_r": pearson_r, "spearman_r": spearman_r,
            "mae": mae, "top20_precision": per_gw["top20_precision"].mean(),
        })
        print(f"  congestion_weight={congestion_weight:.2f}  pearson_r={pearson_r:.4f}  spearman_r={spearman_r:.4f}  "
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
    best_weight = float(best["congestion_weight"])
    print(f"\nBest on the search sample by pearson_r: congestion_weight={best_weight}. "
          f"Confirming against the FULL GW{MIN_GW}-{MAX_GW} backtest...\n")

    best_per_gw, best_compiled = run_backtest(congestion_weight=best_weight)
    print(f"=== congestion_weight={best_weight} on the FULL backtest ===")
    summarize(best_per_gw, best_compiled)

    print(f"\n=== For comparison, congestion_weight=0.0 (off) on the FULL backtest ===")
    default_per_gw, default_compiled = run_backtest(congestion_weight=0.0)
    summarize(default_per_gw, default_compiled)
