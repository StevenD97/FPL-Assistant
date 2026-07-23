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
- `predict_player_points()`/`predict_multi_gw_points()` take an
  `apply_live_signals` flag (default `False`) that layers two of
  bootstrap's own fields on top of the gw_history-trained numbers: live
  injury/suspension status (`compute_live_availability`, from
  `chance_of_playing_next_round`/`status`) scales appearance probability,
  and current primary set-piece duty
  (`penalties_order`/`direct_freekicks_order`/`corners_and_indirect_freekicks_order`)
  boosts `goal_share`/`assist_share` - closing the two biggest blind spots
  found in a review of what data the model wasn't using (an unpatched
  injury previously inflated every scoring category; a new penalty taker
  wasn't reflected until goals off it actually accumulated in the
  archive). Verified directly against live data: three Arsenal defenders
  actually injured right now (Saliba, J.Timber, White) each had
  predicted_points correctly collapse toward zero with the flag on,
  unchanged with it off.
  **Deliberately not turned on anywhere yet** - `bootstrap_file` is a
  single frozen snapshot (end-of-season for the archive currently in
  use), so its status/duty fields are only accurate for whichever moment
  that snapshot was taken. Enabling this by default now would apply
  end-of-season 2025/26 injury news to every demo-mode prediction
  regardless of which gameweek is being predicted, and applying it
  inside a backtest would inject a wrong, constant signal for any player
  whose injury/duty status changed mid-season. Turn it on once
  `bootstrap_file` is a snapshot genuinely current for `reference_date` -
  i.e. once the app is predicting today's actual next gameweek, not a
  demo date.
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
- `optimizer.py` is a real integer-linear-programming solver (PuLP,
  bundled CBC), not a ranking - the biggest gap found by the project
  sense-check against the rest of the FPL tooling market (even free
  open-source projects commonly solve the constrained transfer decision
  this way; this app previously only ranked players). `optimize_best_squad()`
  finds the provably optimal 15/XI/captain under budget alone (Wildcard/
  Free Hit case); `optimize_transfers()` does the same starting from an
  existing squad, weighing predicted points gained against the -4 hit
  per transfer beyond the free allowance - the solver decides transfer
  *count* itself, and correctly returns 0 transfers when a squad is
  already optimal (needed a small tie-breaking term in the objective,
  `-0.0001 * transfers_out`, since without it the solver could report a
  "phantom" transfer between two equally-worthless bench players that
  changed nothing). Both are built on `predict_multi_gw_points()`, not
  the single-gameweek predictor, matching the multi-week finding above.
  Exposed via `/api/optimizer/best-squad` and
  `/api/squad/{team_id}/optimize-transfers`, and a new Optimizer page
  in the frontend with both modes. Also wired into the My Squad page:
  loading a squad automatically fires the transfers optimizer alongside
  it (no separate button) and shows a "Suggested transfers" panel above
  the squad table - a non-blocking failure there (e.g. the picks-reset
  issue below) doesn't affect the squad view, which loaded successfully
  already since both share the same underlying picks fetch.
  **v1 simplification**: treats a player's current price as their sale
  price for transfer purposes, which isn't always exactly true in real
  FPL (selling a risen-in-price player only refunds part of the profit)
  - not exposed by this project's current data sources, documented the
  same way as team_model.py's other approximations.
  **Also discovered while building this**: FPL appears to reset/purge
  manager pick history at each season boundary - a real, previously
  fetchable team id (`1178869`, used by `fetch_my_team.py`) now returns
  "No Entry matches the given query", and even fetching a fresh
  low-numbered id (`entry/1/`) shows a `joined_time` of today, not an
  established account. This means `/api/squad/{team_id}/optimize-transfers`
  (and the pre-existing `/api/squad/{team_id}` and
  `/api/squad/{team_id}/chips`) currently can't be demoed against a real
  historical 2025/26 squad - only against a squad from a gameweek that
  manager's picks still exist for. Not fully worked around yet; flagged
  clearly in the Optimizer page's UI rather than silently broken.
- **Squad Builder** (`/squad-builder`) is a manual drafting tool, distinct
  from both `optimizer.py` (automated, from-scratch or transfer-based)
  and My Squad (views a real existing squad): pick your own 15 within
  budget and get live diagnostic feedback as you go - club concentration
  (3+ from one team), missing exposure to one of the league's easier
  upcoming fixture runs, a tough run among teams you already own, and no
  recognized primary penalty taker - each paired with concrete
  affordable players (filtered to positions you still need, where any
  remain) to fix it, one click to add.
  Architecturally the opposite of the optimizer endpoints: only two
  lightweight backend endpoints exist (`/api/squad-builder/players` and
  `/api/squad-builder/fixtures`, both pinned to the live 2026/27 roster -
  see "Drafting from the live 2026/27 roster" below), fetched once on
  page load; every diagnostic recomputes instantly client-side as you
  add/remove players, with no round trip per click.
  **Fixed a real ~2x slowdown found while investigating why this page
  loaded slowly**: `predict_multi_gw_points()` was calling
  `predict_player_points()` once per gameweek in the window, and each
  call independently recomputed team strengths, involvement shares,
  appearance probabilities, and history rates from scratch - all of
  which depend only on `reference_date`, not on which gameweek is being
  predicted, so a 5-gameweek window was silently doing that setup work
  5 times over. Split into `_build_prediction_context()` (the
  reference_date-dependent setup, now built once) and
  `_predict_for_event()` (the actual per-gameweek loop, reused across
  the window) - `predict_player_points()` itself is unchanged in
  behavior, just internally composed from the same two pieces. This
  wasn't Squad-Builder-specific: it also speeds up the Outlook page and
  every Optimizer endpoint, all of which call `predict_multi_gw_points()`.
  Verified as a pure performance fix, not a behavior change: diffed the
  full player list's JSON output before/after (byte-identical) and
  re-ran the full backtest (identical Pearson r/Spearman/MAE numbers to
  the existing baseline above). Measured warm-cache improvement:
  `/api/squad-builder/players` dropped from ~1.4s to ~0.7s.
- **Drafting from the live 2026/27 roster**: Squad Builder and every
  Optimizer endpoint (`/api/optimizer/best-squad`,
  `/api/squad-builder/players`+`/fixtures`,
  `/api/squad/{team_id}/optimize-transfers`) now draw their player pool,
  prices, and fixtures from the live-fetched `bootstrap_static.json`/
  `fixtures.json` (2026/27) instead of the archived 2025/26 files,
  while still *training* the model on the archived 2025/26 gw_history -
  no 2026/27 match data exists yet to train on. This split (`bootstrap_file`/
  `fixtures_file`/`season` = what the model learns from vs
  `roster_bootstrap_file`/`roster_fixtures_file` in `team_model.py` =
  who it predicts for) required solving two problems the usual
  live/archived split doesn't have to:
  - **Team-id remapping.** `team_strengths` is keyed by *archived*
    (2025/26) team ids, but the roster's fixtures use *live* (2026/27)
    ids - the same reassignment risk documented throughout this file,
    just crossing a season boundary instead of two files within one
    season. `_remap_team_strengths_to_roster()` re-keys it by matching
    team **name** between the two bootstraps' team lists. Promoted teams
    with no top-flight history in the archive (Coventry City, Hull City,
    Ipswich Town for 2026/27) get neutral `DEFAULT_TEAM_STRENGTH` ratios
    rather than a fabricated number.
  - **Player-id remapping.** The same problem, one level down, and it
    shipped as a real bug before being caught: an earlier version of this
    assumed a player's `id` field is stable across the season boundary
    (verified only that the *set* of live ids was a subset of the
    archive's - true, but irrelevant) and used it directly to look up
    involvement shares/appearance probabilities/history rates. It isn't
    stable - FPL recompacts/reassigns `id` every season for players no
    longer fielded, exactly like it does with team ids. Checked directly:
    of the 555 live-roster element ids that also happen to exist as ids
    in the 2025/26 archive, **550 refer to a different real player**
    once compared by FPL's actually-stable `code` field (e.g. live id
    303 is Cédric Kipré at newly-promoted Ipswich; that same id was James
    Garner at Everton in the 2025/26 archive). The bug's symptoms were
    exactly what you'd expect: promoted-club players with zero real
    Premier League history showing large predicted points (borrowed from
    whoever's old id they inherited), James Maddison's real injury-hit
    2025/26 season replaced by a healthy stranger's, and an optimizer
    squad that underspent its budget because several "bargains" were
    actually mispriced ghosts of unrelated players. Fixed by
    `_map_player_stats_to_roster()`, which re-keys involvement/
    appearance_probs/history_rates from the archive's id space to the
    roster's by matching `code` instead of `id` - of the 555 live-roster
    players, 453 have a genuine 2025/26 top-flight record this way; the
    rest (new-to-the-PL signings, promoted-club players) correctly get
    no history and default to a neutral/zero prediction rather than a
    fabricated one.
  - **Half-life recalibration.** The default `half_life_days=21` is
    tuned for *within-season* recency (weeks apart) and decays a ~90-day
    close-season gap (2025/26 ended 2026-05-24; 2026/27 GW1 is
    2026-08-21) to near-zero weight, which collapses `_shrink_ratio`'s
    confidence toward every team looking equally average - measured:
    the spread across teams' `attack_home` ratios drops from ~0.52
    in-season to ~0.04 across that gap at `half_life_days=21`.
    `team_model.CROSS_SEASON_HALF_LIFE_DAYS=90` is used instead for
    these endpoints, chosen empirically by matching the resulting
    spread/rank-correlation back against the in-season, end-of-season
    baseline (spread ~0.50, Spearman ~0.81 between the two rankings for
    the same teams).

  `apply_live_signals=True` for these endpoints (the live bootstrap is a
  genuinely current snapshot here, unlike the frozen archived-only demo
  paths), so injury/suspension status and current set-piece duty are
  reflected. `build_player_pool()` also now returns `value` (predicted
  points per £m - two players can score similarly at very different
  prices, and value is what actually matters under a budget constraint),
  `selected_by_percent` (ownership), and `status`/`news` (live
  availability, shown as a badge next to a player's name when not
  `"a"`/available) - surfaced in both the Squad Builder and Optimizer
  pages.

  `/api/squad/{team_id}/optimize-transfers` draws from the same live
  roster/pool now too, but the manager-picks half of that endpoint is
  still blocked on the season-boundary reset noted above: no team id has
  a fetchable squad until its first 2026/27 gameweek deadline passes.
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
