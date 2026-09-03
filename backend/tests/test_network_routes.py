"""
Characterization goldens for the routes that would otherwise hit the live FPL
API (a manager's entry, squad, chips, transfer optimisation, planner, leagues).

These are the only paths that exercise build_squad_analysis, build_chip_strategy
and optimize_transfers, so they matter for the reorg — but their inputs are live
and unstable. We make them deterministic by stubbing the two network seams with
fixed, realistic payloads and freezing the output:

  * entry / picks / history -> ingest.client.get_entry / get_entry_picks /
    get_entry_history (what fetch_entry_info / fetch_entry_picks /
    fetch_entry_history delegate to, imported at call time, so patching the
    client module always intercepts). History matters as much as the other two
    now that the transfer routes derive a manager's free-transfer count from
    it - unstubbed, entry 123 is a real manager and the golden would move with
    their season.
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

# Picks for the two managers in _STANDINGS, so effective ownership has real
# multipliers to add up. Alice captains the first starter and benches the last
# four; Bob captains a different player and owns two Alice does not - which is
# what makes the differential lists non-empty in both directions.
def _entry_picks(elements, captain):
    return {"picks": [
        {"element": eid, "position": i + 1,
         "multiplier": 0 if i >= 11 else (2 if eid == captain else 1)}
        for i, eid in enumerate(elements)
    ]}


_LEAGUE_PICKS = {
    111: _entry_picks(_SQUAD, captain=_START[0]),
    222: _entry_picks([*_START[:9], 300, 301, *_BENCH], captain=_START[1]),
}

_HISTORY = {"current": [
    {"event": 1, "total_points": 55, "points": 55},
    {"event": 2, "total_points": 118, "points": 63},
]}

# The manager's own season, for the free-transfer count the transfer routes now
# derive rather than assume (fpl.domain.transfers). Deliberately not all zeros:
# nothing until GW8, so the bank fills and hits the cap of 5, then two moves in
# GW8 and one in GW9. Going into GW10 - the event the goldens below pin - that
# is 5 -> spend 2, +1 -> 4 -> spend 1, +1 -> 4. So the golden exercises the cap
# and the spending, and would notice either being dropped.
ENTRY_HISTORY = {
    "current": [
        {"event": e, "event_transfers": {8: 2, 9: 1}.get(e, 0), "event_transfers_cost": 0}
        for e in range(1, 10)
    ],
    "chips": [],
    "past": [],
}


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
    if "/event/" in url and url.rstrip("/").endswith("picks"):
        entry = int(url.split("/entry/")[1].split("/")[0])
        if entry in _LEAGUE_PICKS:
            return _FakeResp(200, _LEAGUE_PICKS[entry])
        return _FakeResp(404, {})
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
        monkeypatch.setattr(mod, "get_entry_history", lambda team_id: ENTRY_HISTORY, raising=False)
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
    ("league_ownership", "/api/leagues/999/ownership?event=10&team_id=222"),
    # The "we never froze that week" shape. The available:true branch is
    # covered in tests/unit/test_counterfactual.py, which can plant a frozen
    # file; a golden cannot, because writing one after the fact is exactly what
    # the feature refuses to do.
    ("entry_captain_review", "/api/entry/123/captain-review"),
    # Two gameweeks rather than five: the golden is here to pin the response
    # shape and the free-transfer accounting, and a five-week solve over the
    # full pool is not something to run on every test invocation.
    ("squad_transfer_plan",
     "/api/squad/123/transfer-plan?reference_date=2025-11-30&next_event=10&gw_count=2"),
]


@pytest.mark.parametrize("name,url", NETWORK_ROUTES, ids=[n for n, _ in NETWORK_ROUTES])
def test_network_route_golden(client, monkeypatch, name, url):
    _patch_all(monkeypatch)
    resp = client.get(url)
    assert resp.status_code == 200, f"{name}: {resp.status_code}: {resp.text[:400]}"
    assert_golden(name, {"status": resp.status_code, "body": resp.json()})
