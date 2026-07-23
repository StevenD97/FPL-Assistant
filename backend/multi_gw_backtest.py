"""
Tests whether team_model.py's single-gameweek accuracy ceiling (pooled
Pearson r=0.55/r^2=0.30, Spearman r=0.73 - see backtest.py) is really
just football's inherent single-match variance, or an actual modeling
shortfall.

Logic: if the model's underlying signal is real but week-to-week
scoring is genuinely noisy, then predicting further out - summed over a
window of several gameweeks - should average that single-match noise
out and correlate noticeably better with what actually happened. If
widening the window doesn't help, that points at a real gap in the
model instead of just variance.

For each window size and each valid starting gameweek, predicts every
player's total points across [gw, gw+window) using ONLY data strictly
before gw's deadline - predictions are NOT updated mid-window, since
this simulates "predict now for the next N weeks" (the realistic
product use case), not "re-predict every week with hindsight" - then
compares the summed prediction to what they actually scored across that
same window.

Run with: venv\\Scripts\\python.exe multi_gw_backtest.py
"""

import sys
from datetime import datetime

import pandas as pd

from analysis import load_bootstrap, load_gw_history
from backtest import BOOTSTRAP_FILE, FIXTURES_FILE, MAX_GW, MIN_GW, SEASON, _spearman
from team_model import predict_player_points

WINDOW_SIZES = [1, 3, 5]


def predict_window_total(reference_date, next_events, **kwargs):
    """Sums predict_player_points() across next_events, all conditioned on the same reference_date."""
    total = None
    for event in next_events:
        pred = predict_player_points(reference_date, event, **kwargs)[["id", "predicted_points"]].set_index("id")
        total = pred if total is None else total.add(pred, fill_value=0)
    return total["predicted_points"]


def actual_window_total(history, gws):
    return history[history["GW"].isin(gws)].groupby("element")["total_points"].sum()


def run_window_backtest(window_size, min_gw=MIN_GW, max_gw=MAX_GW):
    bootstrap = load_bootstrap(BOOTSTRAP_FILE)
    event_deadlines = {
        e["id"]: datetime.strptime(e["deadline_time"], "%Y-%m-%dT%H:%M:%SZ")
        for e in bootstrap["events"]
    }
    history = load_gw_history(SEASON)

    compiled = []
    last_start = max_gw - window_size + 1
    for start_gw in range(min_gw, last_start + 1):
        window_gws = list(range(start_gw, start_gw + window_size))
        if any(gw not in event_deadlines for gw in window_gws):
            continue

        predicted = predict_window_total(
            event_deadlines[start_gw], window_gws, season=SEASON,
            bootstrap_file=BOOTSTRAP_FILE, fixtures_file=FIXTURES_FILE,
        ).rename("predicted_points")
        actual = actual_window_total(history, window_gws).rename("actual_points")

        merged = pd.concat([predicted, actual], axis=1).fillna(0)
        merged["start_gw"] = start_gw
        compiled.append(merged)

    return pd.concat(compiled)


def summarize_window(window_size, compiled):
    pearson = compiled["predicted_points"].corr(compiled["actual_points"])
    spearman = _spearman(compiled["predicted_points"], compiled["actual_points"])
    mae = (compiled["predicted_points"] - compiled["actual_points"]).abs().mean()
    top20 = compiled.groupby("start_gw").apply(
        lambda g: len(set(g.nlargest(20, "predicted_points").index) & set(g.nlargest(20, "actual_points").index)) / 20
    ).mean()
    print(f"window={window_size:>2} GW  n={len(compiled):>6}  "
          f"pearson_r={pearson:.4f} (r^2={pearson ** 2:.4f})  spearman_r={spearman:.4f}  "
          f"mae={mae:.4f}  top20_precision={top20:.4f}")
    return {"window_gws": window_size, "n": len(compiled), "pearson_r": pearson,
            "r_squared": pearson ** 2, "spearman_r": spearman, "mae": mae, "top20_precision": top20}


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", 200)

    print("=== Does correlation improve when predicting further out (summed over a window), vs single-gameweek? ===")
    print("(If yes: single-gameweek noise is mostly variance, not a modeling gap. If no: real modeling gap.)\n")

    results = []
    for window in WINDOW_SIZES:
        window_compiled = run_window_backtest(window)
        results.append(summarize_window(window, window_compiled))

    print("\n=== Summary ===")
    print(pd.DataFrame(results).round(4).to_string(index=False))
