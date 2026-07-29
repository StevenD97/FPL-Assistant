"""
Central configuration for the FPL Assistant backend.

Two things live here:

* ``Settings`` — 12-factor settings read from the environment (or a local
  ``.env``), so the same code runs against local Postgres in dev and a managed
  instance in prod; only ``DATABASE_URL`` differs.
* Shared constants — filesystem and FPL endpoint locations that used to be
  duplicated across ``analysis.py`` / ``db/config.py``. One definition each.
"""
import os
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The FPL data snapshots (JSON/CSV) used as the DB fallback and as the model's
# training archive now live in a sibling `data/` folder at the monorepo root,
# next to backend/ and frontend/ — not inside the backend package. Anchored to
# this file's location (backend/fpl/config.py -> repo root) so it resolves the
# same no matter the working directory (Render runs with rootDir=backend, CI
# from backend/, tests from backend/). Override with FPL_DATA_DIR if the data
# lives elsewhere (e.g. a mounted volume or a separately-checked-out repo).
DATA_DIR = Path(os.environ.get("FPL_DATA_DIR") or Path(__file__).resolve().parents[2] / "data")

# FPL public API + the Premier League image CDNs (badges/kits/player photos).
FPL_API_BASE = "https://fantasy.premierleague.com/api"
PL_RESOURCES_BASE = "https://resources.premierleague.com/premierleague"
FPL_STATIC_BASE = "https://fantasy.premierleague.com/dist/img"

# Which on-disk snapshot each request reads. The model TRAINS on the archived
# 2025/26 files; the live roster/prices/fixtures (who the players are) come
# from the live files. FPL reassigns team/element ids every season, so an
# archived file must never be mixed with a live one in the same computation
# (see fpl.domain.scoring / fpl.model.predict). load_bootstrap/load_fixtures
# map these filenames back to a season - see fpl.data.db.read.
ARCHIVED_BOOTSTRAP_FILE = "bootstrap_static_2025_26_final.json"
ARCHIVED_FIXTURES_FILE = "fixtures_2025_26_final.json"
LIVE_BOOTSTRAP_FILE = "bootstrap_static.json"
LIVE_FIXTURES_FILE = "fixtures.json"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Postgres. Local default targets the docker-compose/Podman container; in
    # prod, set DATABASE_URL to the managed endpoint (postgresql+psycopg://...).
    database_url: str = "postgresql+psycopg://fpl:fpl_local_dev@localhost:5432/fpl"

    @field_validator("database_url")
    @classmethod
    def _normalize_driver(cls, v: str) -> str:
        """
        Managed Postgres providers (Render, Heroku, RDS) commonly hand out
        connection strings as postgres:// or plain postgresql://, both of
        which make SQLAlchemy default to the psycopg2 driver - not installed
        here (this app uses psycopg3, psycopg[binary] in requirements.txt).
        create_engine() then fails at import time with an unhandled error,
        which db_healthy()'s try/except never gets a chance to catch
        (confirmed directly: /api/ready 500'd with a raw "Internal Server
        Error" the moment DATABASE_URL was first set on Render, using its
        plain postgresql:// connection string). Force the +psycopg driver
        suffix regardless of which scheme was given, so pasting a provider's
        connection string straight in just works.
        """
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            v = "postgresql+psycopg://" + v[len("postgresql://"):]
        return v

    # FPL public API.
    fpl_api_base: str = FPL_API_BASE

    # Seasons: the model trains on the archive; the live roster/predictions
    # target the current season. Stored as first-class rows so the same DB
    # holds both (see README's live/archived split).
    archive_season: str = "2025_26"
    current_season: str = "2026_27"

    # If the DB is empty or unreachable, fall back to the on-disk JSON/CSV
    # snapshots so local dev, tests, and cold deploys still work.
    allow_file_fallback: bool = True

    # Demo mode (env var DEMO_MODE): every manager lookup (any team id)
    # resolves to the same fixed squad instead of hitting the live FPL API -
    # see fpl.demo. Used only by the `demo` branch's own deployment for
    # reviewer feedback; the default (off) leaves the real production
    # behaviour untouched.
    demo_mode: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
