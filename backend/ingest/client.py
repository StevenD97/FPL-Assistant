"""
Resilient FPL API client: a shared requests.Session with retries, exponential
backoff, and timeouts. FPL rate-limits and returns transient 5xx/429s under
load, so every call goes through this rather than a bare requests.get.
"""
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from db.config import get_settings

_settings = get_settings()
_TIMEOUT = 30


def _build_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=4,
        backoff_factor=0.8,  # 0.8s, 1.6s, 3.2s, 6.4s between retries
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update({"User-Agent": "FPL-Assistant/1.0 (data ingest)"})
    return session


_SESSION = _build_session()


def _get(path: str) -> dict | list:
    response = _SESSION.get(f"{_settings.fpl_api_base}{path}", timeout=_TIMEOUT)
    response.raise_for_status()
    return response.json()


def get_bootstrap() -> dict:
    return _get("/bootstrap-static/")


def get_fixtures() -> list:
    return _get("/fixtures/")


def get_event_live(event: int) -> dict:
    return _get(f"/event/{event}/live/")


def get_entry(team_id: int) -> dict:
    return _get(f"/entry/{team_id}/")


def get_entry_picks(team_id: int, event: int) -> dict:
    return _get(f"/entry/{team_id}/event/{event}/picks/")
