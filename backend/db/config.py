"""
Central 12-factor settings. Read from environment (or a local .env), so the
exact same code runs against local Postgres in dev and the managed RDS
instance in prod - only DATABASE_URL differs.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Postgres. Local default targets the docker-compose/Podman container; in
    # prod, set DATABASE_URL to the RDS endpoint (postgresql+psycopg://...).
    database_url: str = "postgresql+psycopg://fpl:fpl_local_dev@localhost:5432/fpl"

    # FPL public API.
    fpl_api_base: str = "https://fantasy.premierleague.com/api"

    # Seasons: the model trains on the archive; the live roster/predictions
    # target the current season. Stored as first-class rows so the same DB
    # holds both (see README's live/archived split).
    archive_season: str = "2025_26"
    current_season: str = "2026_27"

    # If the DB is empty or unreachable, fall back to the on-disk JSON/CSV
    # snapshots so local dev, tests, and cold deploys still work.
    allow_file_fallback: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
