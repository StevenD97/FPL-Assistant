"""
Walk-forward backtest for team_model.py's predict_player_points().

For every gameweek of the 2025/26 archive (from MIN_GW onward - the
first couple of weeks have too little history for the recency-weighted
stats to mean anything), predicts every player's points using only data
strictly before that gameweek's deadline, then compares the prediction
against what they actually scored that gameweek. This is the "don't
just trust the model, check it against a season we already know the
answer to" step - see the FPL scoring model docstring in team_model.py
for what it's built from.

Reports, per gameweek and pooled across the whole backtest:
  - MAE / RMSE (average error in points)
  - Pearson correlation (does a higher prediction mean a higher score?)
  - Spearman rank correlation (does it get the *ordering* right - more
    relevant to FPL than exact points, since transfers/captaincy are
    ranking decisions)
  - top-20 precision (of the 20 players predicted highest, how many
    were actually in that gameweek's top 20 by actual points - a proxy
    for "would this have helped pick a captain/differential")

Also writes the full compiled predicted-vs-actual dataset to
data/backtest_results_2025_26.csv, and an error breakdown by position,
as the basis for the next round of model tuning (e.g. adjusting
half_life_days, or checking if one scoring category dominates the
error) - "compile the results and use them to improve it" is a
follow-up step on top of this, not something this script does itself.

Run with: python -m tools.eval.backtest  (from the backend/ folder)
Override the season with: BACKTEST_SEASON=2026_27 python -m tools.eval.backtest  (from the backend/ folder)
(once a full 2026/27 archive exists to backtest against - bootstrap/fixtures/
gw_history filenames all derive from BACKTEST_SEASON by the same naming
convention the rest of the app uses, and results are written to a
season-specific CSV, so re-running this for a new season never silently
overwrites the previous season's baseline - see the season-transition
notes in the README for why this mattered enough to parameterize.
"""

import os
import sys
from datetime import datetime

import pandas as pd

from fpl.config import DATA_DIR
from fpl.data.loaders import load_bootstrap, load_gw_history
from fpl.model.predict import predict_player_points
from fpl.model.rules import SHARE_SMOOTHING_ALPHA, SHRINKAGE_GAMES

SEASON = os.environ.get("BACKTEST_SEASON", "2025_26")
BOOTSTRAP_FILE = f"bootstrap_static_{SEASON}_final.json"
FIXTURES_FILE = f"fixtures_{SEASON}_final.json"
MIN_GW = 2  # GW1 has zero prior history - team strengths/shares are all undefined, not a meaningful test
MAX_GW = int(os.environ.get("BACKTEST_MAX_GW", 38))
HALF_LIFE_DAYS = 21


def _actual_points_by_gw(history, gw):
    """element -> total_points actually scored in this GW (summed across fixtures, for DGWs)."""
    return history[history["GW"] == gw].groupby("element")["total_points"].sum()


def _spearman(a, b):
    """Spearman rank correlation = Pearson correlation of the ranks - avoids a scipy dependency."""
    return a.rank().corr(b.rank())


def _top_n_precision(merged, n=20):
    predicted_top = set(merged.nlargest(n, "predicted_points")["id"])
    actual_top = set(merged.nlargest(n, "actual_points")["id"])
    return len(predicted_top & actual_top) / n


def run_backtest(min_gw=MIN_GW, max_gw=MAX_GW, half_life_days=HALF_LIFE_DAYS,
                  shrinkage_games=SHRINKAGE_GAMES, smoothing_alpha=SHARE_SMOOTHING_ALPHA,
                  gameweeks=None):
    """gameweeks overrides min_gw/max_gw with an explicit list - tune.py uses this to sample every Nth week."""
    bootstrap = load_bootstrap(BOOTSTRAP_FILE)
    event_deadlines = {
        e["id"]: datetime.strptime(e["deadline_time"], "%Y-%m-%dT%H:%M:%SZ")
        for e in bootstrap["events"]
    }
    history = load_gw_history(SEASON)

    per_gw_rows = []
    compiled = []

    for gw in (gameweeks if gameweeks is not None else range(min_gw, max_gw + 1)):
        if gw not in event_deadlines:
            continue

        predicted = predict_player_points(
            event_deadlines[gw], gw, half_life_days=half_life_days, season=SEASON,
            bootstrap_file=BOOTSTRAP_FILE, fixtures_file=FIXTURES_FILE, shrinkage_games=shrinkage_games,
            smoothing_alpha=smoothing_alpha,
        )
        actual = _actual_points_by_gw(history, gw).rename("actual_points")

        merged = predicted.merge(actual, left_on="id", right_index=True, how="left")
        merged["actual_points"] = merged["actual_points"].fillna(0)
        merged["gw"] = gw
        merged["error"] = merged["predicted_points"] - merged["actual_points"]
        compiled.append(merged)

        if merged["predicted_points"].std() == 0:
            # Degenerate week (e.g. right at the start of the season) - correlation is undefined.
            pearson_r, spearman_r = float("nan"), float("nan")
        else:
            pearson_r = merged["predicted_points"].corr(merged["actual_points"])
            spearman_r = _spearman(merged["predicted_points"], merged["actual_points"])

        per_gw_rows.append({
            "gw": gw,
            "n_players": len(merged),
            "mae": merged["error"].abs().mean(),
            "rmse": (merged["error"] ** 2).mean() ** 0.5,
            "pearson_r": pearson_r,
            "spearman_r": spearman_r,
            "top20_precision": _top_n_precision(merged),
        })

    per_gw = pd.DataFrame(per_gw_rows)
    compiled_df = pd.concat(compiled, ignore_index=True)
    return per_gw, compiled_df


def summarize(per_gw, compiled_df):
    print("=== Per-gameweek accuracy ===")
    print(per_gw.round(3).to_string(index=False))

    print("\n=== Pooled across all backtested gameweeks (statistically the more robust number) ===")
    pooled_pearson = compiled_df["predicted_points"].corr(compiled_df["actual_points"])
    pooled_spearman = _spearman(compiled_df["predicted_points"], compiled_df["actual_points"])
    print(f"n predictions: {len(compiled_df)}")
    print(f"MAE:  {compiled_df['error'].abs().mean():.3f}")
    print(f"RMSE: {(compiled_df['error'] ** 2).mean() ** 0.5:.3f}")
    print(f"Pearson r:  {pooled_pearson:.3f}  (r^2 = {pooled_pearson ** 2:.3f})")
    print(f"Spearman r: {pooled_spearman:.3f}")
    print(f"Mean top-20 precision: {per_gw['top20_precision'].mean():.3f}")

    print("\n=== Mean absolute error by position ===")
    print(compiled_df.groupby("position")["error"].apply(lambda e: e.abs().mean()).round(3))

    print("\n=== Bias check: mean (predicted - actual) by position (systematic over/under-prediction) ===")
    print(compiled_df.groupby("position")["error"].mean().round(3))

    print("\n=== Does accuracy improve as more history accumulates? (first half vs second half of backtest) ===")
    midpoint = per_gw["gw"].median()
    early = per_gw[per_gw["gw"] <= midpoint]
    late = per_gw[per_gw["gw"] > midpoint]
    print(f"GW{early['gw'].min()}-{early['gw'].max()}: mean Pearson r = {early['pearson_r'].mean():.3f}")
    print(f"GW{late['gw'].min()}-{late['gw'].max()}: mean Pearson r = {late['pearson_r'].mean():.3f}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", 200)

    per_gw_results, compiled_results = run_backtest()
    summarize(per_gw_results, compiled_results)

    # Season-specific filename (not a fixed "2025_26" literal) so re-running
    # this for a new season (BACKTEST_SEASON=2026_27) never clobbers the
    # previous season's checked-in baseline.
    out_path = DATA_DIR / f"backtest_results_{SEASON}.csv"
    compiled_results.to_csv(out_path, index=False)
    print(f"\nFull compiled predicted-vs-actual data written to {out_path}")
