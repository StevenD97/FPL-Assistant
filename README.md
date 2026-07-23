# FPL Assistant

A web app that takes your Fantasy Premier League team and recommends transfers,
captaincy picks, and chip timing based on fixture difficulty, expected returns,
recent form, rotation risk, and more.

## Project structure

```
backend/    FastAPI + Python analysis engine
frontend/   Next.js (TypeScript) web app
```

## Current status / known limitations

- The 2026/27 season hadn't started yet as of this writing, so several
  scripts/endpoints use hardcoded "demo dates" pointing at last season
  (2025/26) instead of the real current gameweek. Search for `REFERENCE_DATE`,
  `NEXT_EVENT`, `START_EVENT` in `backend/` to find these - they'll need
  updating once the new season's fixtures are published.
- `backend/data/bootstrap_static_2025_26_final.json` and
  `fixtures_2025_26_final.json` are backed-up snapshots of last season's
  final data (useful for a future "draft helper" feature, since new-season
  stats reset to zero pre-season and these numbers become irreplaceable
  once FPL resets its API for the new season).
- `backend/data/gw_history_2025_26.csv` is 2025/26's gameweek-by-gameweek
  player data (one row per player per GW - points, minutes, xG/xA, ICT,
  bps, etc.), pulled via `fetch_gw_history.py` from the
  [vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League)
  community archive. The live FPL API only keeps this level of detail for
  the *current* season - once 2026/27 went live, 2025/26 collapsed into a
  single aggregated row per player with no gameweek breakdown, so this
  archive is the only way to get it now. Backs a recency-weighted form
  score (`analysis.py`'s `compute_recency_weighted_form`, replacing FPL's
  own canned 30-day `form` average) and `team_model.py` (below).
- `team_model.py` is a second, independent points estimate, run
  alongside (not replacing) `recommendation_score`: a Dixon-Coles-style
  attack/defence strength model predicts each side's expected goals for
  a fixture from recency-weighted goals scored/conceded, then splits
  that across players by their historical share of their team's
  goals/assists. Exposed via `/api/players/predicted-points`. v1 scope
  is goals/assists/clean-sheets/appearance only - no bonus points,
  defensive contribution, saves, or cards yet.
- No chatbot yet (deferred - would need an Anthropic API key and a small
  recurring cost).

## Setup

### Prerequisites

- Python 3.x
- Node.js (v18+)

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in your own API-Football key (used for
research into cup/European fixtures - free tier signup at api-football.com;
not required for the app's core features to run):

```bash
copy .env.example .env
```

Pull the FPL data the app needs:

```bash
venv\Scripts\python.exe fetch_data.py
```

Run the API:

```bash
venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

API docs available at http://127.0.0.1:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App available at http://localhost:3000

### Using it

Both servers need to be running at the same time. Open the frontend and use
your own FPL team ID (found in the URL when viewing your team on the official
FPL site, e.g. `fantasy.premierleague.com/entry/1234567/...`) on the "My Squad"
and "Chip Strategy" pages.
