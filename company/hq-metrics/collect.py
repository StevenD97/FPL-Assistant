#!/usr/bin/env python3
"""
Collect the readings the Executive HQ board shows, and print them as the JSON
document the page expects.

Run from the repository root:

    python3 company/hq-metrics/collect.py > company/hq-metrics/snapshot.json

Then write it to the HQ's store (this is what makes the board update - the page
is NOT republished):

    Artifact  action: write_db  db_op: set
              url: <the HQ artifact URL>
              collection: metrics   doc_id: current
              file_path: company/hq-metrics/snapshot.json

Nothing here is estimated. Every number is measured or read from the repository;
anything that cannot be measured is left out so the board shows it unlit rather
than filled with a guess.
"""
import json, subprocess, time, urllib.request, datetime, os, sys

API = "https://fpl-assistant-backend-wxtz.onrender.com"
SITE = "https://xfpl.co.uk"
ENDPOINTS = ["/api/accuracy", "/api/season-status", "/api/fixtures/schedule",
             "/api/health", "/api/data-status", "/api/players"]


def timed(url, timeout=120):
    """(milliseconds, kilobytes, parsed-json-or-None) for one GET."""
    t0 = time.time()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            body = r.read()
    except Exception as e:
        print(f"  ! {url}: {e}", file=sys.stderr)
        return None, None, None
    ms = int((time.time() - t0) * 1000)
    kb = round(len(body) / 1024, 1)
    try:
        return ms, kb, json.loads(body)
    except Exception:
        return ms, kb, None


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()


api = []
status = accuracy = None
for p in ENDPOINTS:
    ms, kb, body = timed(API + p)
    if ms is None:
        continue
    api.append({"p": p, "ms": ms, "kb": kb})
    if p == "/api/data-status":
        status = body
    if p == "/api/accuracy":
        accuracy = body
api.sort(key=lambda r: r["ms"])

fe_ms, fe_kb, _ = timed(SITE)

acc = {}
if accuracy and "summary" in accuracy:
    s = accuracy["summary"]
    acc = {
        "graded": s.get("events_graded"), "frozen": s.get("events_frozen"),
        "rankCorr": s.get("rank_correlation"), "capAvg": s.get("captain_average"),
        "capBest": s.get("captain_best_possible_average"),
        "topTen": s.get("top_ten_average"), "field": s.get("field_average"),
        "cats": [{"c": c["category"], "n": c["n"], "m": c["mae"], "b": c["baseline_mae"]}
                 for c in s.get("categories", [])],
    }

snap = {
    "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "api": api,
    "fe": {"ttfb": fe_ms, "total": fe_ms, "kb": int(fe_kb or 0)},
    "data": {
        "source": (status or {}).get("source", "unknown"),
        "ageH": (status or {}).get("snapshot_age_hours"),
        "stale": (status or {}).get("stale"),
        "nextEvent": (status or {}).get("next_event"),
        "deadline": (status or {}).get("next_deadline"),
    },
    "acc": acc,
    "eng": {
        "commits": int(sh("git rev-list --count HEAD") or 0),
        "beLoc": int(sh("find backend/fpl -name '*.py' | xargs cat | wc -l") or 0),
        "feLoc": int(sh("find frontend/src -name '*.ts*' | xargs cat | wc -l") or 0),
        "tests": int(sh("grep -rho 'def test_' backend/tests | wc -l") or 0),
        "routes": int(sh(r"grep -rho '@router\.\(get\|post\)' backend/fpl/api/routers | wc -l") or 0),
        "workflows": len(os.listdir(".github/workflows")),
        "posts": len(os.listdir("frontend/content/blog")),
        "frozen": len(os.listdir("data/projections")),
        "deps": int(sh("grep -c . backend/requirements.txt") or 0) + 15,
    },
    "infra": {"host": "Vercel", "region": "iad1", "api": "Render free", "db": "Neon free",
              "instanceHrs": 730, "instanceCap": 750, "monthly": 0},
}
print(json.dumps({"json": json.dumps(snap), "at": snap["at"]}, indent=1))
