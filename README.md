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

- The 2026/27 season hadn't started as of this writing (GW1 deadline:
  2026-08-21), but its fixture calendar and team list (Coventry City,
  Hull City, Ipswich Town promoted; Burnley, West Ham, Wolves relegated)
  are already live on the FPL API - `check_new_season.py` confirms this.
  Player-level stats (total_points, minutes, ep_next, etc.) are NOT yet
  reset though - they still carry last season's final values until FPL
  resets them nearer kickoff, so this app deliberately uses **two
  different data sources depending on what a feature needs**:
  - Team/fixture-only features (fixture difficulty ranking on the
    Fixtures page) use the live-fetched files (`bootstrap_static.json`/
    `fixtures.json`) - safe now, since they never touch player stats.
  - Player-scoring features (`recommendation_score`, `team_model.py`,
    squad/chip planning) default to the archived 2025/26 files
    (`bootstrap_static_2025_26_final.json`/`fixtures_2025_26_final.json`)
    instead, to avoid silently scoring off stale pre-reset numbers.

  **This split has a sharp edge**: FPL reassigns numeric team ids
  alphabetically every season - team id 3 was Burnley in 2025/26, is
  Bournemouth in 2026/27 - so any code that merges a live-season result
  with an archived-season result by team id (as `build_squad_analysis`
  and `build_chip_strategy` do internally, joining player scores against
  a fixture ticker) would silently attach the wrong team's fixtures to a
  player if the two calls used different seasons' files. Every function
  that does this kind of merge (`build_squad_analysis`,
  `build_chip_strategy`, and the standalone `my_squad.py`/
  `chip_strategy.py` scripts) now takes explicit `bootstrap_file`/
  `fixtures_file` params and passes the *same* season's files to every
  internal call - see analysis.py's docstrings before changing any of
  these defaults individually.

  Search `REFERENCE_DATE`, `NEXT_EVENT`, `START_EVENT` in `backend/` for
  the demo dates still pointing at 2025/26 - once FPL resets player
  stats for the new season (watch for it with `check_new_season.py`)
  and a matching `gw_history_2026_27.csv` archive exists (`fetch_gw_history.py`,
  once vaastav's repo has this season's data), those + every
  `bootstrap_file`/`fixtures_file`/`season` default flagged above are
  what need updating - not a quick swap, since team_model.py's learned
  attack/defence ratios and involvement shares are trained on whichever
  archive `season` points at.
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
  goals/assists. Covers every category in FPL's 2025/26 scoring rules
  (appearance, goals, assists, clean sheets, goals conceded, bonus,
  saves, penalty saves/misses, cards, own goals, and the new defensive
  contribution threshold) - see the module docstring for which of those
  come from the fixture-level model vs. a recency-weighted personal
  rate, and the approximations involved (bonus is a flat historical
  average rather than a simulated BPS system; defensive
  contribution/saves assume a Poisson distribution around the
  recency-weighted average count). Exposed via
  `/api/players/predicted-points`.
- `backtest.py` walk-forward tests `team_model.py` against every 2025/26
  gameweek (GW2-38): predicts every player using only data strictly
  before that gameweek, then checks the prediction against what they
  actually scored. Current baseline (run `venv\Scripts\python.exe backtest.py`
  to reproduce): pooled Pearson r = 0.55 (r² = 0.30), Spearman rank
  correlation = 0.73, MAE = 0.92 pts/player/gameweek, top-20 precision
  (overlap between predicted and actual top 20 scorers) = 14%. Reads as:
  the model is meaningfully better than chance at *ranking* players
  (Spearman 0.73), noticeably worse at nailing the *exact* points total
  (Pearson 0.55) - expected, given how much of FPL scoring (bonus points,
  explosive one-off hauls) is inherently high-variance. No strong
  systematic bias by position (mean predicted-minus-actual error is
  within ±0.08 pts for every position) and accuracy is stable across the
  season rather than degrading late on.
  **Fixed by the backtest**: `compute_team_goal_strengths()`'s ratios are
  now shrunk toward the league average (1.0), in proportion to how much
  recency-weighted evidence backs them (`_shrink_ratio`,
  `SHRINKAGE_GAMES`) - previously a team with only 1-2 games of history
  could produce a ratio driven almost entirely by noise (seen: a
  `defence_home` ratio of 4.16, a `defence_away` ratio of exactly 0),
  and multiplying two such ratios together produced nonsensical
  predictions (Richarlison predicted 21.9 pts for GW4, actually scored
  1). After the fix, the highest prediction across all 31,117
  backtested player-gameweeks is 13.3 (down from 21.9), and every
  remaining large miss traces back to a genuine explosive real
  performance (a 24-point haul, etc.) rather than a model artifact.
  Tried tuning `half_life_days`/`SHRINKAGE_GAMES` (`tune.py`, a 36-combo
  grid search validated out-of-sample against the full backtest, not
  just the search sample) - no combination meaningfully beat the
  defaults (21 days / 3 games); results were essentially flat across a
  wide range of both, so this pair of knobs is tapped out as a lever for
  further accuracy.
- `multi_gw_backtest.py` answers the question that actually matters for
  whether this is sellable: is the ~14% single-gameweek top-20 hit rate
  a modeling shortfall, or just football's inherent single-match
  variance? (For context: random guessing gets ~2.4% here, so single-
  gameweek predictions are already a real 6x edge over chance, not
  noise - but "14%" alone undersells that.) Tested by summing
  predictions over wider windows (3 and 5 gameweeks, still using only
  data available before the window starts) and checking whether
  correlation improves - if the model's signal is real and weekly
  scoring is just noisy, averaging over more weeks should cancel that
  noise out and reveal it. It does, cleanly: r² goes from 0.30 (1 GW) to
  0.44 (3 GW) to 0.49 (5 GW), Spearman from 0.73 to 0.82, with no change
  to the model itself. Conclusion: the single-gameweek ceiling is mostly
  variance, not a data or modeling gap - the product implication is to
  lead with multi-week outlooks ("best transfer targets for the next 5
  gameweeks") rather than single-gameweek point predictions, which is
  both more accurate and closer to how FPL managers actually plan
  transfers anyway.
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
