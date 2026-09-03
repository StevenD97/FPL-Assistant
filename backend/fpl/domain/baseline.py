"""
The baseline every projection has to beat, and the categories it gets judged in.

A model is only worth running if it beats the obvious thing you could do
instead. The obvious thing, and the baseline the OpenFPL paper (arXiv
2508.09992) uses to benchmark commercial FPL services, is simply: predict that
a player scores what they have averaged over their last five matches.

That comparison is deliberately unflattering. Published RMSE at a one-gameweek
horizon puts the state of the art only 5-34% ahead of it, and on Haulers - the
players who actually decide a gameweek - the best commercial model is ~8%
ahead. Any projection that cannot clear this bar is not adding information,
however sophisticated its internals.

The four return categories are the paper's, and they exist because a pooled
error figure hides everything that matters. Most players score nothing most
weeks, so a model that confidently predicts zero for everyone looks good in
aggregate and is useless. Splitting by what actually happened separates
"knows who won't play" from "knows who will haul" - different skills, very
different value.
"""

LAST_N_MATCHES = 5

# Category boundaries, in points actually scored. Matches the OpenFPL paper so
# our figures sit in the same table as theirs.
CATEGORIES = ("Zeros", "Blanks", "Tickers", "Haulers")


def categorise(points, minutes):
    """
    Which return category an actual outcome falls in.

    Zeros are separated from Blanks by minutes, not points: a player who did
    not play is a squad-selection question, while a player who played and
    returned nothing is a performance question. Conflating them lets a model
    take credit for predicting zeros it only got right because the player was
    dropped.
    """
    if minutes == 0:
        return "Zeros"
    if points <= 2:
        return "Blanks"
    if points <= 4:
        return "Tickers"
    return "Haulers"


def last_n_baseline(history, gw, n=LAST_N_MATCHES):
    """
    element id -> mean points over their last `n` appearances strictly before
    `gw`. A player with no prior appearance gets 0, which is the honest answer
    for someone with no record rather than a guess.

    `history` is a gw_history frame (one row per player per fixture) with at
    least `element`, `GW` and `total_points`. Only gameweeks before `gw` are
    read, so this carries no more hindsight than the model it is judging.
    """
    past = history[history["GW"] < gw]
    if past.empty:
        return {}
    # Sum within a gameweek first: a double gameweek is one week's return, not
    # two of the last five matches.
    per_gw = past.groupby(["element", "GW"], as_index=False)["total_points"].sum()
    per_gw = per_gw.sort_values(["element", "GW"])
    recent = per_gw.groupby("element").tail(n)
    return recent.groupby("element")["total_points"].mean().to_dict()


def score_by_category(frame, predicted="predicted_points", actual="actual_points",
                      category="category"):
    """
    RMSE and MAE within each return category, plus a pooled row.

    Returns a list of dicts rather than a DataFrame so callers can serialise it
    straight to JSON for the public accuracy record.
    """
    rows = []
    for name in CATEGORIES:
        subset = frame[frame[category] == name]
        if subset.empty:
            continue
        error = subset[predicted] - subset[actual]
        rows.append({
            "category": name,
            "n": int(len(subset)),
            "rmse": round(float((error ** 2).mean() ** 0.5), 3),
            "mae": round(float(error.abs().mean()), 3),
        })
    error = frame[predicted] - frame[actual]
    rows.append({
        "category": "All",
        "n": int(len(frame)),
        "rmse": round(float((error ** 2).mean() ** 0.5), 3),
        "mae": round(float(error.abs().mean()), 3),
    })
    return rows
