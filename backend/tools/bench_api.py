"""
Time every endpoint the app actually calls, against a running backend.

Exists so a performance claim in this repo is a measurement rather than an
impression. Point it at localhost to measure the compute, or at the deployed
backend to measure what a visitor gets - the two answer different questions and
the gap between them is the hosting.

    python tools/bench_api.py                     # local
    python tools/bench_api.py https://... --json before.json
    python tools/bench_api.py https://... --compare before.json

Reports time-to-first-byte rather than total, because for every endpoint here
the body is small enough that transfer is noise next to the think time - except
/api/players, where the two are reported separately for exactly that reason.
Each endpoint is hit REPEATS times and the best run is kept: the aim is to
measure the code, and the slowest run mostly measures whatever else the machine
was doing. The first hit is reported separately as `cold`, since a cache that
only helps the second visitor is not the same product as one that helps the
first.
"""
import argparse
import json
import sys
import time
import urllib.request

# A real manager's entry id - the squad endpoints need one that exists, and a
# made-up id measures the 404 path instead of the work.
TEAM_ID = 6567403

# Every endpoint a page load can touch, grouped the way the caching policy
# groups them (see fpl.api.caching), so a change to one shows up as a block.
SHARED = [
    "/api/players",
    "/api/squad-builder/players",
    "/api/squad-builder/fixtures",
    "/api/fixtures/schedule",
    "/api/fixtures/difficulty",
    "/api/teams",
    "/api/optimizer/best-squad",
    "/api/players/price-watch",
    "/api/players/predicted-points-outlook",
    "/api/accuracy",
    "/api/data-status",
]
PER_MANAGER = [
    f"/api/squad/{TEAM_ID}",
    f"/api/squad/{TEAM_ID}/planner",
    f"/api/squad/{TEAM_ID}/chips",
    f"/api/squad/{TEAM_ID}/optimize-transfers",
    f"/api/entry/{TEAM_ID}",
]

REPEATS = 3


def hit(base, path):
    """One request. Returns (ttfb, total, bytes, status, cache_control, cf_status)."""
    req = urllib.request.Request(
        base + path,
        headers={"Accept-Encoding": "gzip, br", "User-Agent": "xfpl-bench"},
    )
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            headers = resp.headers
            first = time.perf_counter()
            body = resp.read()
            return {
                "ttfb": first - start,
                "total": time.perf_counter() - start,
                "bytes": len(body),
                "status": resp.status,
                "cache_control": headers.get("Cache-Control", "-"),
                "cdn": headers.get("cf-cache-status", "-"),
                "encoding": headers.get("Content-Encoding", "-"),
            }
    except Exception as exc:  # noqa: BLE001 - a failed endpoint is a result, not a crash
        return {"ttfb": time.perf_counter() - start, "total": time.perf_counter() - start,
                "bytes": 0, "status": getattr(exc, "code", 0), "cache_control": "-",
                "cdn": "-", "encoding": "-"}


def measure(base, paths):
    out = {}
    for path in paths:
        runs = [hit(base, path) for _ in range(REPEATS)]
        best = min(runs, key=lambda r: r["ttfb"])
        out[path] = {
            "cold_ttfb": runs[0]["ttfb"],
            "ttfb": best["ttfb"],
            "total": best["total"],
            "bytes": best["bytes"],
            "status": best["status"],
            "cache_control": best["cache_control"],
            "cdn": best["cdn"],
            "encoding": best["encoding"],
        }
    return out


def render(results, compare=None):
    header = f"{'endpoint':<44}{'ttfb':>9}{'cold':>9}{'bytes':>10}  {'enc':<5}{'cdn':<10}cache-control"
    print(header)
    print("-" * len(header))
    for path, r in results.items():
        line = (f"{path:<44}{r['ttfb'] * 1000:>7.0f}ms{r['cold_ttfb'] * 1000:>7.0f}ms"
                f"{r['bytes']:>10,}  {r['encoding']:<5}{r['cdn']:<10}{r['cache_control']}")
        if compare and path in compare:
            was = compare[path]["ttfb"]
            now = r["ttfb"]
            if was > 0:
                change = (now - was) / was * 100
                line += f"   [was {was * 1000:.0f}ms, {change:+.0f}%]"
        print(line)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base", nargs="?", default="http://localhost:8000")
    ap.add_argument("--json", help="write results here")
    ap.add_argument("--compare", help="read an earlier --json and show the delta")
    args = ap.parse_args()

    base = args.base.rstrip("/")
    compare = json.load(open(args.compare)) if args.compare else None

    print(f"\n{base}\n")
    results = {}
    for label, paths in (("shared (cacheable)", SHARED), ("per-manager", PER_MANAGER)):
        print(f"== {label} ==")
        section = measure(base, paths)
        render(section, compare)
        results.update(section)
        print()

    if args.json:
        json.dump(results, open(args.json, "w"), indent=1)
        print(f"wrote {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
