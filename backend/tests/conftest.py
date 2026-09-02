"""
Characterization test harness.

Goal: pin the CURRENT API behaviour so the backend reorg can be proven to
preserve it byte-for-byte. Tests hit the real app through a FastAPI TestClient
and compare each response against a committed golden JSON file.

Determinism: we force every DB-backed loader down its on-disk fallback path by
pointing DATABASE_URL at an unreachable host before the app is imported. So the
suite reads only the committed snapshots in ``backend/data/`` and needs no
Postgres, no network, and no live FPL season.

The app lives at ``fpl.api.main`` (thin routers over the services/domain/model
layers). The same goldens were captured against the pre-refactor monolith and
have held byte-for-byte through the whole reorg.

Refresh goldens intentionally with:  FPL_UPDATE_GOLDENS=1 pytest
"""
import os

# Must happen before anything imports db.session / analysis (engine is built at
# import time from get_settings(), which reads the environment once).
os.environ["DATABASE_URL"] = "postgresql+psycopg://fpl:fpl@127.0.0.1:1/fpl"
os.environ["ALLOW_FILE_FALLBACK"] = "true"

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

GOLDEN_DIR = Path(__file__).parent / "golden"
_UPDATE = os.environ.get("FPL_UPDATE_GOLDENS") == "1"


@pytest.fixture(scope="session")
def client():
    from fpl.api.main import app

    return TestClient(app)


# Decimal places every float in a golden is rounded to before comparison.
#
# Without this the goldens only pass on the machine that generated them. They
# recorded full float64 repr, and values built by long floating-point
# reductions - recency_weighted_form's exponential decay sum is the worst -
# differ in the last significant digit across CPUs, because numpy is free to
# vectorise and reassociate the sum differently. Real examples, same commit and
# the same pinned numpy, developer machine vs CI runner:
#
#   2.5175308869521595  vs  2.517530886952159
#   5.427427217459395   vs  5.427427217459394
#
# That is a relative difference around 1e-16 - float64's own noise floor, not a
# behaviour change. These are scores, forms and prices, so nine decimal places
# is many orders of magnitude below anything the app or a reader could act on,
# while still catching any change worth calling a regression.
_FLOAT_PRECISION = 9


def _round_floats(value):
    """Recursively round floats so a golden means the same thing on any machine."""
    if isinstance(value, float):
        return round(value, _FLOAT_PRECISION)
    if isinstance(value, dict):
        return {k: _round_floats(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_round_floats(v) for v in value]
    return value


def _canonical(payload) -> str:
    # sort_keys => key ordering never causes a false diff; default=str keeps any
    # stray non-JSON scalar (e.g. a datetime) stable rather than crashing.
    return json.dumps(_round_floats(payload), sort_keys=True, indent=2, default=str)


def assert_golden(name: str, payload) -> None:
    """Compare ``payload`` to golden ``name``; (re)write it in update mode or on
    first capture. Exact string match — moving code must not change any value."""
    GOLDEN_DIR.mkdir(exist_ok=True)
    path = GOLDEN_DIR / f"{name}.json"
    current = _canonical(payload)
    if _UPDATE or not path.exists():
        path.write_text(current + "\n")
        return
    expected = path.read_text().rstrip("\n")
    assert current == expected, (
        f"Golden mismatch for {name!r}. If this change is intentional, refresh "
        f"with FPL_UPDATE_GOLDENS=1 pytest."
    )


def check_route(client, name: str, url: str, expected_status: int = 200):
    """GET ``url``, assert the status, and snapshot status+body as golden ``name``."""
    resp = client.get(url)
    assert resp.status_code == expected_status, (
        f"{name}: expected {expected_status}, got {resp.status_code}: {resp.text[:300]}"
    )
    assert_golden(name, {"status": resp.status_code, "body": resp.json()})
