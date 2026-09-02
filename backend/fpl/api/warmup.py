"""
Build the prediction caches before anyone asks for them.

Every scoring endpoint funnels into one prediction context: recency-weighted
team strengths, involvement shares, appearance probabilities and personal
history rates, each a full pass over the gameweek-history archive. Once built
it is cached and every request is single-digit milliseconds; building it costs
seconds, and whoever arrives first pays for it.

On a container that never sleeps that's a one-off nobody sees. On a free tier
that spins down after fifteen minutes of quiet it is *most* visits: measured
cold on this machine, /api/players took 2.7s against 48ms warm, and on the
smaller production CPU the same call was timed at 7.1s. That cost is entirely
avoidable - nothing about it depends on the request.

So it runs during startup, before the port binds, for the gameweek and window
the endpoints' own dynamic defaults use. Binding first and warming in the
background is worse than either extreme: a request arriving mid-warm computes
the same context a second time in parallel and both are slower for it
(measured: 4.9s, against 2.7s for the plain cold path). A host does not route
traffic to a service that has not bound its port yet, and on Render that wait
is folded into a spin-up the visitor is already waiting through.

It is bounded, though, because a slow startup that never finishes is an
outage. The work happens on a daemon thread the startup joins with a timeout;
if the timeout passes, the app binds anyway and the warm carries on behind it.
Every failure is swallowed: a warmup that breaks must never stop the app
serving, and anything it fails to precompute is computed on demand, exactly as
before.
"""
import logging
import os
import threading
import time

log = logging.getLogger(__name__)

# The window /api/players and the squad endpoints default to. Kept here rather
# than imported from a router so warming can't drift into doing real work.
DEFAULT_GW_COUNT = 5


def _warm():
    from fpl.config import (
        ARCHIVED_BOOTSTRAP_FILE,
        ARCHIVED_FIXTURES_FILE,
        LIVE_BOOTSTRAP_FILE,
        LIVE_FIXTURES_FILE,
    )
    from fpl.domain.gameweek import get_gw_context
    from fpl.model.predict import predict_multi_gw_breakdown
    from fpl.model.rules import CROSS_SEASON_HALF_LIFE_DAYS

    started = time.perf_counter()
    ctx = get_gw_context()
    next_event = ctx["next_event"]
    predict_multi_gw_breakdown(
        ctx["reference_date"], list(range(next_event, next_event + DEFAULT_GW_COUNT)),
        half_life_days=CROSS_SEASON_HALF_LIFE_DAYS,
        bootstrap_file=ARCHIVED_BOOTSTRAP_FILE, fixtures_file=ARCHIVED_FIXTURES_FILE,
        apply_live_signals=True,
        roster_bootstrap_file=LIVE_BOOTSTRAP_FILE, roster_fixtures_file=LIVE_FIXTURES_FILE,
    )
    log.info("prediction cache warmed in %.1fs (GW%d, %d-gameweek window)",
             time.perf_counter() - started, next_event, DEFAULT_GW_COUNT)


# How long startup will wait for the warm before binding the port anyway.
# Long enough for the real work (2.7s here, ~7s on the production CPU) with
# room to spare, short enough that a pathological warm can't look like a
# failed deploy.
WARMUP_TIMEOUT_SECONDS = float(os.environ.get("FPL_WARMUP_TIMEOUT", "45"))


def start_warmup():
    """
    Warm the prediction cache, waiting up to WARMUP_TIMEOUT_SECONDS for it.

    Returns the thread (still running if it timed out) so a caller could join
    it again; nothing does.

    Set FPL_SKIP_WARMUP=1 to opt out entirely - the test suite does, since it
    pins its own reference dates and would only be warming a cache entry no
    assertion reads, and it is the switch to reach for in local development if
    a few seconds at every reload is not worth it.
    """
    if os.environ.get("FPL_SKIP_WARMUP"):
        return None

    def run():
        try:
            _warm()
        except Exception:
            # Warming is an optimisation. A failure here means the first real
            # request pays what it always used to; it must never be fatal.
            log.warning("prediction cache warmup failed; falling back to on-demand", exc_info=True)

    thread = threading.Thread(target=run, name="fpl-warmup", daemon=True)
    thread.start()
    thread.join(WARMUP_TIMEOUT_SECONDS)
    if thread.is_alive():
        log.warning(
            "prediction cache still warming after %.0fs - serving anyway",
            WARMUP_TIMEOUT_SECONDS,
        )
    return thread
