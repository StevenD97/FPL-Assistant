"""
Characterization goldens for the routes that would otherwise hit the live FPL
API (a manager's entry, squad, chips, transfer optimisation, planner, leagues).

These are the only paths that exercise build_squad_analysis, build_chip_strategy
and optimize_transfers, so they matter for the reorg — but their inputs are live
and unstable. We make them deterministic by stubbing the two network seams with
fixed, realistic payloads and freezing the output:

  * entry / picks  -> ingest.client.get_entry / get_entry_picks (what
    fetch_entry_info / fetch_entry_picks delegate to, imported at call time,
    so patching the client module always intercepts).
  * leagues         -> requests.get (the leagues routes call it directly; the
    ingest client uses its own Session, so this patch is independent).

Both seams are patched at their post-refactor locations too (raising=False), so
the same test runs unchanged after db/ingest move under fpl.data.

The squad ids are real top-owned elements from the committed bootstrap, laid out
as a legal 4-4-2 (11 starters + 4 bench), so every id-space merge/remap resolves
non-empty and nothing hits an empty-Series edge.
"""
import pytest

from conftest import assert_golden

# --- canned FPL payloads -----------------------------------------------------

# 1 GKP, 4 DEF, 4 MID, 2 FWD starting (positions 1-11); backup GKP + 1 of each
# outfield on the bench (positions 12-15). Real element ids from data/.
_START = [1, 8, 387, 356, 423, 426, 368, 40, 397, 411, 165]  # GKP,DEF*4,MID*4,FWD*2
_BENCH = [109, 346, 154, 259]                                # GKP,FWD,MID,DEF
_SQUAD = _START + _BENCH

ENTRY_INFO = {
    "id": 123,
    "player_first_name": "Test",
    "player_last_name": "Manager",
    "name": "Test FC",
    "summary_overall_rank": 100_000,
    "summary_overall_points": 512,
    "last_deadline_value": 1004,
    "last_deadline_bank": 6,
    "current_event": 10,
}

PICKS = {
    "picks": [
        {
            "element": eid,
            "position": i + 1,
            "multiplier": 2 if i == 0 else 1,
            "is_captain": i == 0,
            "is_vice_captain": i == 1,
        }
        for i, eid in enumerate(_SQUAD)
    ],
    "entry_history": {"event": 10, "points": 58, "value": 1004, "bank": 6},
}

_ENTRY_WITH_LEAGUES = {
    **ENTRY_INFO,
    "leagues": {
        "classic": [
            {"id": 314, "name": "Overall", "entry_rank": 100_000},
            {"id": 999, "name": "My Mini League", "entry_rank": 4},
        ]
    },
}

_STANDINGS = {
    "league": {"name": "My Mini League"},
    "standings": {
        "has_next": False,
        "results": [
            {"entry": 111, "player_name": "Alice A", "entry_name": "AFC",
             "rank": 1, "last_rank": 2, "total": 640, "event_total": 62},
            {"entry": 222, "player_name": "Bob B", "entry_name": "BFC",
             "rank": 2, "last_rank": 1, "total": 618, "event_total": 47},
        ],
    },
}

_HISTORY = {"current": [
    {"event": 1, "total_points": 55, "points": 55},
    {"event": 2, "total_points": 118, "points": 63},
]}


class _FakeResp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            import requests
            raise requests.exceptions.HTTPError(response=self)


def _fake_requests_get(url, params=None, timeout=None, **kwargs):
    if "/leagues-classic/" in url and "standings" in url:
        return _FakeResp(200, _STANDINGS)
    if url.rstrip("/").endswith("history"):
        return _FakeResp(200, _HISTORY)
    if "/entry/" in url:
        return _FakeResp(200, _ENTRY_WITH_LEAGUES)
    return _FakeResp(404, {})


def _patch_all(monkeypatch):
    # entry/picks seam — patch both the pre- and post-refactor client modules.
    for modname in ("ingest.client", "fpl.data.ingest.client"):
        try:
            mod = __import__(modname, fromlist=["*"])
        except ModuleNotFoundError:
            continue
        monkeypatch.setattr(mod, "get_entry", lambda team_id: ENTRY_INFO, raising=False)
        monkeypatch.setattr(mod, "get_entry_picks", lambda team_id, event: PICKS, raising=False)
    # leagues seam — patch the requests library function itself (stable name).
    import requests
    monkeypatch.setattr(requests, "get", _fake_requests_get)


NETWORK_ROUTES = [
    ("entry_summary", "/api/entry/123"),
    ("squad_analysis", "/api/squad/123?reference_date=2025-11-30&next_event=10&window_size=5"),
    ("squad_chips", "/api/squad/123/chips?scan_start_event=10&scan_end_event=15"),
    ("squad_optimize_transfers",
     "/api/squad/123/optimize-transfers?reference_date=2025-11-30&next_event=10&gw_count=5&free_transfers=1"),
    ("squad_planner", "/api/squad/123/planner?reference_date=2025-11-30&next_event=10&gw_count=4"),
    ("manager_leagues", "/api/leagues/123"),
    ("league_standings", "/api/leagues/999/standings"),
]


@pytest.mark.parametrize("name,url", NETWORK_ROUTES, ids=[n for n, _ in NETWORK_ROUTES])
def test_network_route_golden(client, monkeypatch, name, url):
    _patch_all(monkeypatch)
    resp = client.get(url)
    assert resp.status_code == 200, f"{name}: {resp.status_code}: {resp.text[:400]}"
    assert_golden(name, {"status": resp.status_code, "body": resp.json()})
