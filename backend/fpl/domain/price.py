"""
Price-change signals: per-player net-transfer momentum as a heuristic proxy for
"at risk of a price change soon". NOT a reverse-engineering of FPL's proprietary
price algorithm — see compute_price_change_signals' docstring for exactly what
this is and isn't.
"""
import pandas as pd

# Below this many *absolute* net transfers today (transfers_in_event -
# transfers_out_event), momentum_pct below is dropped from the ranking -
# for a barely-owned player, estimated_owners is tiny, so even a handful
# of transfers can produce a huge, meaningless percentage. Not FPL's real
# per-player threshold (nobody outside FPL knows that - see
# compute_price_change_signals' docstring), just a floor for "worth
# surfacing at all".
MIN_NET_TRANSFERS_TO_FLAG = 500


def compute_price_change_signals(bootstrap, history_snapshots=None):
    """
    Per-player net-transfer momentum, as a heuristic proxy for "at risk of
    a price change soon" - NOT a claim to have reverse-engineered FPL's
    actual price-change algorithm, which is proprietary and has never been
    published. What's actually known and used here:
      - FPL moves a player's price by exactly £0.1m at most once a day
        (~2:30am UK), driven by that day's net transfers in/out crossing
        an internal threshold that scales with ownership and reportedly
        also price band/time of season - see fantasyfootballscout.co.uk's
        "How do FPL price changes work?" and community trackers (LiveFPL,
        Fantasy Football Fix) that have reverse-engineered it well enough
        to predict the large majority of daily changes correctly, though
        the exact formula has never been confirmed by FPL itself.
      - transfers_in_event/transfers_out_event (already fetched into
        bootstrap-static by this app) count net transfers since the
        *last* price change for that player, resetting to 0 when one
        happens - exactly the raw signal those trackers are built on.

    Rather than guessing at FPL's precise (unknown, variable) threshold,
    this ranks players by net transfers today *relative to current
    ownership* (momentum_pct): a player moving 1% of their own owner base
    in a day is significant whether they're owned by 2% or 60% of
    managers, which a raw transfer count alone doesn't capture.
    estimated_owners is derived from selected_by_percent x
    bootstrap["total_players"] (FPL doesn't publish a raw per-player
    owner count directly).

    FPL's own price_change_percent field is passed through as-is under
    official_progress_percent - presumably its own authoritative progress-
    toward-threshold figure (premierleague.com announced a "Price Change
    Predictor" for 2026/27, updated every 15 minutes on FPL's own site),
    but every element's value is still 0 as of writing (no 2026/27
    transfer activity yet), so its exact sign convention/scale can't be
    verified against real data here - surfaced for reference, not treated
    as ground truth by the momentum_pct ranking above.

    history_snapshots (optional): [(fetched_at, bootstrap_dict), ...],
    oldest first - e.g. from fpl.data.db.read.recent_bootstrap_snapshots. When
    given (2+ snapshots), adds transfer_rate_per_hour - see
    _transfer_rate_per_hour - showing whether today's net transfers are a
    slow trickle or accelerating, not just the current snapshot's total.
    """
    total_players = bootstrap.get("total_players") or 1
    rate_by_id = _transfer_rate_per_hour(history_snapshots) if history_snapshots else {}

    rows = []
    for el in bootstrap["elements"]:
        net = el["transfers_in_event"] - el["transfers_out_event"]
        owned_pct = float(el["selected_by_percent"])
        estimated_owners = max(owned_pct / 100 * total_players, 1)
        momentum_pct = round(net / estimated_owners * 100, 3) if abs(net) >= MIN_NET_TRANSFERS_TO_FLAG else 0.0

        rows.append({
            "id": el["id"],
            "web_name": el["web_name"],
            "team": el["team"],
            "code": el["code"],
            "cost": round(el["now_cost"] / 10, 1),
            "selected_by_percent": owned_pct,
            "transfers_in_event": el["transfers_in_event"],
            "transfers_out_event": el["transfers_out_event"],
            "net_transfers_event": net,
            "momentum_pct": momentum_pct,
            "direction": "rising" if net > 0 else "falling" if net < 0 else "stable",
            "already_moved_today": el["cost_change_event"] != 0,
            "official_progress_percent": el.get("price_change_percent"),
            "transfer_rate_per_hour": rate_by_id.get(el["id"]),
        })
    return pd.DataFrame(rows)


def _transfer_rate_per_hour(history_snapshots):
    """
    element -> net transfers per hour, from the earliest-to-latest change
    in (transfers_in_event - transfers_out_event) across
    history_snapshots' window - see compute_price_change_signals. Omits
    any player whose net-transfer count *decreased* in magnitude
    somewhere in the window: transfers_in_event/transfers_out_event reset
    to 0 the moment a price actually changes, so a decrease means a reset
    happened partway through, not that transfers reversed - reporting a
    rate across a reset would be actively wrong, not just imprecise.
    """
    if len(history_snapshots) < 2:
        return {}
    earliest_fetched_at, earliest_data = history_snapshots[0]
    latest_fetched_at, latest_data = history_snapshots[-1]
    elapsed_hours = (latest_fetched_at - earliest_fetched_at).total_seconds() / 3600
    if elapsed_hours < 1:
        return {}

    earliest_by_id = {el["id"]: el["transfers_in_event"] - el["transfers_out_event"] for el in earliest_data["elements"]}
    latest_by_id = {el["id"]: el["transfers_in_event"] - el["transfers_out_event"] for el in latest_data["elements"]}

    rates = {}
    for element_id, latest_net in latest_by_id.items():
        earliest_net = earliest_by_id.get(element_id, 0)
        if abs(latest_net) < abs(earliest_net):
            continue
        rates[element_id] = round((latest_net - earliest_net) / elapsed_hours, 1)
    return rates
