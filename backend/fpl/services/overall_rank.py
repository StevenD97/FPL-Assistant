"""
Where a points total would actually place you, out of everyone playing.

"145 points" means nothing on its own, and the usual dodge - comparing against
the published gameweek average - flatters everybody, because that average is
dragged down by abandoned teams. The number a manager cares about is a rank, and
FPL publishes enough to work one out exactly.

The Overall league (id 314) holds every entry in the game, ordered by total
points, fifty to a page. So a total maps to a rank by finding where it would
slot into that order. Reading ten million entries to do it would be absurd;
because the ordering is monotonic, binary searching the pages costs about twenty
requests.

This is a real lookup against real managers, not a model of the distribution.

TIES
----
FPL ranks by standard competition: everyone on the same total shares the rank of
the first of them, and the next total resumes after the whole block. So the
answer is the rank of the FIRST entry whose total is at or below ours - joining
the block if one exists, taking its place if not. Reporting the first entry
strictly below instead would put a manager at the bottom of every tie, which
understates a rank by however many people share the score. On a mid-table total
that is thousands of places.
"""
import logging

from fpl.data.ingest import client

log = logging.getLogger(__name__)

# The league every entry is in, whether they know it or not.
OVERALL_LEAGUE_ID = 314

# Where the doubling search gives up looking for the end of the table. At fifty
# entries a page this covers 26 million, comfortably more than the game has ever
# had, and stops a malformed response becoming an unbounded crawl.
MAX_PAGE = 524_288


class _Standings:
    """The league's pages, fetched once each. Counts the real requests."""

    def __init__(self, league_id):
        self.league_id = league_id
        self._pages = {}
        self.requests = 0

    def page(self, number):
        if number not in self._pages:
            payload = client.get_league_standings(self.league_id, number)
            self._pages[number] = payload.get("standings", {}).get("results", []) or []
            self.requests += 1
        return self._pages[number]

    def lowest_total(self, number):
        """The smallest total on a page - its last row, since pages descend."""
        rows = self.page(number)
        return rows[-1]["total"] if rows else None

    def last_known_rank(self):
        """The deepest rank any fetched page revealed, as a table-size estimate."""
        seen = [rows[-1]["rank"] for rows in self._pages.values() if rows]
        return max(seen) if seen else None


def rank_for_total(total, league_id=OVERALL_LEAGUE_ID):
    """
    The overall rank a manager on `total` points would hold.

    Returns {"rank", "entries", "requests"}, or None if the standings cannot be
    read - a rank is worth having but not worth failing a season record over.

    Finds the first entry whose total is at or below `total` (see TIES above).
    Doubles outward to bracket the answer without knowing the table's size, then
    binary searches for the first page that reaches far enough down, then walks
    that page's fifty rows to land exactly.
    """
    table = _Standings(league_id)
    try:
        first = table.page(1)
        if not first:
            return None
        if total > first[0]["total"]:
            return {"rank": 1, "entries": table.last_known_rank(), "requests": table.requests}

        # Phase one: doubling. Find a page whose lowest total has dropped to or
        # below ours - the boundary is on that page or an earlier one.
        lo, hi = 1, 1
        while hi <= MAX_PAGE:
            lowest = table.lowest_total(hi)
            if lowest is None or lowest <= total:
                break
            lo, hi = hi, hi * 2
        else:
            return None

        if table.lowest_total(hi) is None:
            # Ran off the end of the table: the boundary is somewhere between
            # the last full page we saw and here.
            hi = _last_populated_page(table, lo, hi)
            if hi is None:
                return None

        # Phase two: the smallest page that still reaches to or below `total`.
        while lo < hi:
            mid = (lo + hi) // 2
            lowest = table.lowest_total(mid)
            if lowest is not None and lowest <= total:
                hi = mid
            else:
                lo = mid + 1

        # Phase three: the first row on that page at or below `total`.
        for row in table.page(lo):
            if row["total"] <= total:
                return {"rank": row["rank"], "entries": table.last_known_rank(),
                        "requests": table.requests}

        # Nothing on the landing page qualifies, which means `total` sits below
        # every entry in the table.
        deepest = table.last_known_rank()
        return {"rank": (deepest + 1) if deepest else None, "entries": deepest,
                "requests": table.requests}
    except Exception:
        log.warning("overall rank lookup failed", exc_info=True)
        return None


def _last_populated_page(table, known_good, empty):
    """
    The last page that actually has entries, between one known to and one known
    not to. Used when the doubling phase overshoots the end of the table.
    """
    lo, hi = known_good, empty
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if table.page(mid):
            lo = mid
        else:
            hi = mid - 1
    return lo if table.page(lo) else None


def rank_for_total_or_none(total, league_id=OVERALL_LEAGUE_ID):
    """rank_for_total's rank alone - for callers that only want the number."""
    found = rank_for_total(total, league_id)
    return found["rank"] if found else None
