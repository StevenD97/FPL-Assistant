"""
FastAPI application wiring — CORS, startup lifespan, and router registration
only. All request handling lives in fpl.api.routers.*; all logic in
fpl.services.* / fpl.domain.* / fpl.model.*.

Run from the backend/ folder:
    uvicorn fpl.api.main:app --reload
Then visit http://127.0.0.1:8000/docs for interactive API docs.
"""
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from fpl.api.routers import fixtures, health, leagues, optimizer, players, squad, teams
from fpl.data.loaders import ensure_data_fetched

load_dotenv()

# Known frontend origins (local dev + production), always allowed. Any extra
# origins in the ALLOWED_ORIGINS env var are MERGED in rather than replacing
# these - so the production domain keeps working even if that var is unset or
# points at an old URL (e.g. a previous Vercel deployment).
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://192.168.0.19:3000",
    "https://xfpl.co.uk",
    "https://www.xfpl.co.uk",
]

# Registration order matters where a literal path and a path-param route share
# a depth (e.g. /api/players/scores vs /api/players/{player_id}); each router
# orders its own routes so literals win. Across routers the prefixes are
# disjoint, so router order is cosmetic (drives /docs grouping).
_ROUTERS = [health, players, teams, fixtures, optimizer, squad, leagues]


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_data_fetched()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="FPL Assistant API", lifespan=lifespan)

    env_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    allowed_origins = sorted(set(DEFAULT_ALLOWED_ORIGINS) | set(env_origins))
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for module in _ROUTERS:
        app.include_router(module.router)
    return app


app = create_app()
