"""
What each endpoint is allowed to be cached for, in one table.

Every response this API sends today goes out with no Cache-Control at all,
which means the CDN in front of it caches nothing (measured: every endpoint
comes back `cf-cache-status: DYNAMIC`) and the browser re-asks for everything
on every navigation. So a page load costs a full round trip to the Python
process even when the answer is a file that changes once an hour and is
identical for every visitor in the world.

That is the expensive mistake here, more than the compute. `/api/players` is
byte-identical for everyone and is rebuilt from the same hourly snapshot until
the next ingest lands; there is no reason for a second visitor to reach the
origin for it at all.

WHY A TABLE, AND WHY IT DEFAULTS TO no-store
--------------------------------------------
Policy is keyed on the *route template* (`/api/squad/{team_id}`), read off the
matched route rather than pattern-matched against the URL, so there is no
prefix-guessing and no chance of a path like `/api/players/price-watch` picking
up the policy meant for `/api/players/{player_id}`.

Anything not listed is `no-store`. A new endpoint has to be added here
deliberately to become cacheable, which is the safe direction for a mistake to
fall: forgetting an entry costs a round trip, whereas a wrong default could
publish something at the edge that shouldn't be.

`stale-while-revalidate` is doing real work on the free tier, not just shaving
latency. The instance sleeps after fifteen quiet minutes and takes about a
minute to wake; with SWR the visitor is handed the cached copy immediately and
the wake happens behind them, so the cold start stops being something a person
sits through.
"""

# Data that is the same for every visitor and only changes when the hourly
# ingest lands. Fresh for fifteen minutes, then served stale for a day while
# the edge refetches behind the reader.
INGEST_DRIVEN = "public, max-age=60, s-maxage=900, stale-while-revalidate=86400"

# Cheap status reads. Short, because "is the data stale?" answered from a stale
# cache is a joke at the reader's expense.
STATUS = "public, max-age=30, s-maxage=60, stale-while-revalidate=300"

# Keyed on a manager's own entry id. Public FPL data behind a public id - no
# auth, nothing private - but it changes when they transfer, so it gets a short
# life and a long revalidate window.
PER_MANAGER = "public, max-age=30, s-maxage=60, stale-while-revalidate=600"

# The default for anything not named below.
UNCACHED = "no-store"

POLICY_BY_ROUTE = {
    # --- shared, ingest-driven ---
    "/api/players": INGEST_DRIVEN,
    "/api/players/scores": INGEST_DRIVEN,
    "/api/players/price-watch": INGEST_DRIVEN,
    "/api/players/predicted-points": INGEST_DRIVEN,
    "/api/players/predicted-points-outlook": INGEST_DRIVEN,
    "/api/players/{player_id}": INGEST_DRIVEN,
    "/api/players/{player_id}/trajectory": INGEST_DRIVEN,
    "/api/players/{player_id}/alternatives": INGEST_DRIVEN,
    "/api/players/{player_id}/comparison": INGEST_DRIVEN,
    "/api/teams": INGEST_DRIVEN,
    "/api/teams/{team_id}": INGEST_DRIVEN,
    "/api/fixtures/difficulty": INGEST_DRIVEN,
    "/api/fixtures/schedule": INGEST_DRIVEN,
    "/api/squad-builder/players": INGEST_DRIVEN,
    "/api/squad-builder/fixtures": INGEST_DRIVEN,
    "/api/optimizer/best-squad": INGEST_DRIVEN,

    # --- status ---
    "/api/data-status": STATUS,
    "/api/season-status": STATUS,
    "/api/accuracy": STATUS,

    # --- per-manager ---
    "/api/entry/{team_id}": PER_MANAGER,
    "/api/entry/{team_id}/captain-review": PER_MANAGER,
    "/api/squad/{team_id}": PER_MANAGER,
    "/api/squad/{team_id}/planner": PER_MANAGER,
    "/api/squad/{team_id}/chips": PER_MANAGER,
    "/api/squad/{team_id}/optimize-transfers": PER_MANAGER,
    "/api/squad/{team_id}/transfer-plan": PER_MANAGER,
    "/api/leagues/{team_id}": PER_MANAGER,
    "/api/leagues/{league_id}/standings": PER_MANAGER,
    "/api/leagues/{league_id}/ownership": PER_MANAGER,
}


def policy_for(route_path):
    """The Cache-Control value for a matched route template, or no-store."""
    return POLICY_BY_ROUTE.get(route_path, UNCACHED)


class CacheControlMiddleware:
    """
    Stamps Cache-Control on each response according to POLICY_BY_ROUTE.

    Pure ASGI rather than BaseHTTPMiddleware: this only needs to edit the
    headers on the response-start message, and BaseHTTPMiddleware would put a
    task and a queue in the path of every request to do it.

    The route is read from the scope, which the router fills in while handling
    the request - so by the time the response starts, `scope["route"]` is the
    matched APIRoute and its `.path` is the template. A request that matched
    nothing (404) has no route and gets the no-store default.

    An endpoint that has already set its own Cache-Control keeps it; this only
    fills in what nothing else has said.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_policy(message):
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                if not any(k.lower() == b"cache-control" for k, _ in headers):
                    route = scope.get("route")
                    policy = policy_for(getattr(route, "path", None))
                    headers.append((b"cache-control", policy.encode("latin-1")))
            await send(message)

        await self.app(scope, receive, send_with_policy)
