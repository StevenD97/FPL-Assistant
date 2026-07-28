"""
Experiment: does scaling a player's recency-weighted bonus rate by how
favourable THIS fixture's expected scoreline is for their team
(team_xg - opp_xg) improve walk-forward accuracy over the flat, unconditional
season-long average? See BONUS_FIXTURE_SENSITIVITY's docstring in
fpl.model.rules for the mechanics.

Same process as experiment_team_xg.py / experiment_congestion.py: a cheap
sampled grid first, then the full GW2-38 backtest on whichever value wins,
to confirm out of sample.

Run with: python -m tools.eval.experiment_bonus  (from the backend/ folder)
"""
import sys

import pandas as pd

from tools.eval.backtest import MAX_GW, MIN_GW, run_backtest, summarize

BONUS_SENSITIVITY_GRID = [0.0, 0.1, 0.2, 0.3, 0.5]
GW_STEP = 3


def search(grid=BONUS_SENSITIVITY_GRID, gw_step=GW_STEP):
    sample_gws = list(range(MIN_GW, MAX_GW + 1, gw_step))
    print(f"Searching {len(grid)} bonus_fixture_sensitivity values against GW{sample_gws} ({len(sample_gws)} weeks)...\n")

    results = []
    for bonus_fixture_sensitivity in grid:
        per_gw, compiled = run_backtest(bonus_fixture_sensitivity=bonus_fixture_sensitivity, gameweeks=sample_gws)
        pearson_r = compiled["predicted_points"].corr(compiled["actual_points"])
        spearman_r = compiled["predicted_points"].rank().corr(compiled["actual_points"].rank())
        mae = compiled["error"].abs().mean()
        results.append({
            "bonus_fixture_sensitivity": bonus_fixture_sensitivity, "pearson_r": pearson_r, "spearman_r": spearman_r,
            "mae": mae, "top20_precision": per_gw["top20_precision"].mean(),
        })
        print(f"  bonus_fixture_sensitivity={bonus_fixture_sensitivity:.2f}  pearson_r={pearson_r:.4f}  "
              f"spearman_r={spearman_r:.4f}  mae={mae:.4f}  top20_precision={per_gw['top20_precision'].mean():.4f}")

    return pd.DataFrame(results)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", 200)

    grid_results = search()
    print("\n=== Full grid (search sample only) ===")
    print(grid_results.round(4).to_string(index=False))

    best = grid_results.sort_values("pearson_r", ascending=False).iloc[0]
    best_sensitivity = float(best["bonus_fixture_sensitivity"])
    print(f"\nBest on the search sample by pearson_r: bonus_fixture_sensitivity={best_sensitivity}. "
          f"Confirming against the FULL GW{MIN_GW}-{MAX_GW} backtest...\n")

    best_per_gw, best_compiled = run_backtest(bonus_fixture_sensitivity=best_sensitivity)
    print(f"=== bonus_fixture_sensitivity={best_sensitivity} on the FULL backtest ===")
    summarize(best_per_gw, best_compiled)

    print(f"\n=== For comparison, bonus_fixture_sensitivity=0.0 (off) on the FULL backtest ===")
    default_per_gw, default_compiled = run_backtest(bonus_fixture_sensitivity=0.0)
    summarize(default_per_gw, default_compiled)
