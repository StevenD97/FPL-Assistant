# FPL Assistant

A web app that takes your Fantasy Premier League team and recommends transfers,
captaincy picks, and chip timing based on fixture difficulty, expected returns,
recent form, rotation risk, and more.

## Project structure

```
backend/    FastAPI + Python analysis engine
frontend/   Next.js (TypeScript) web app
```

## Visual design

The frontend uses a Premier League-branded design system (white background,
PL purple/green/cyan/pink accents, Geist + Geist Mono, a club-colored pitch
formation view) - originally handed off as a set of standalone design
reference files and recreated here using the app's own Next.js/Tailwind v4
conventions rather than dropped in as-is. No dark mode.

- Design tokens live in `frontend/src/app/globals.css` as plain CSS custom
  properties (colors, type scale, spacing, radii, shadows, all 23 Premier
  League clubs' kit colors keyed by 3-letter code), mapped into Tailwind v4's
  `@theme inline` block so they're usable directly as utility classes
  (`bg-pl-purple`, `text-pos-fwd`, `rounded-lg`, etc).
- Shared components live in `frontend/src/components/`: `ui/` (Button, Card,
  StatTile, PositionBadge, StatusBadge, CaptainBadge, TextField, Select,
  Alert), `pitch/` (TeamBadge, PitchFormation - the club-colored formation
  view used by My Squad), and `nav/NavBar` (the purple wordmark + green
  active-tab underline). `frontend/src/lib/teamColors.ts` maps the API's
  3-letter team codes to the CSS color-token slugs, covering both the live
  2026/27 roster and the archived 2025/26 season's teams (see the live/
  archived split above) since different pages use different seasons' codes.
- Every page (`page.tsx`, `outlook/`, `squad/`, `optimizer/`,
  `differentials/`, `chips/`) was restyled onto these tokens/components -
  structure, state, and data-fetching logic unchanged, styling only. Squad
  Builder (since merged into `/squad` - see below) additionally gained the
  pitch-formation view: the drafted squad renders as a green pitch with
  GKP/DEF/MID/FWD rows, each player a white
  puck ringed in their club's color, alongside the existing player-browser
  table and diagnostics (which still work exactly as before, including
  Remove-by-row - the pitch is a visual addition, not a replacement for the
  functional squad list).

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
- `data/bootstrap_static_2025_26_final.json` and
  `fixtures_2025_26_final.json` (in the repo-root `data/` folder, a sibling of
  `backend/` and `frontend/` — see `data/README.md`) are backed-up snapshots of last season's
  final data (useful for a future "draft helper" feature, since new-season
  stats reset to zero pre-season and these numbers become irreplaceable
  once FPL resets its API for the new season).
- `data/gw_history_2025_26.csv` is 2025/26's gameweek-by-gameweek
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
  to reproduce): pooled Pearson r = 0.57 (r² = 0.32), Spearman rank
  correlation = 0.70, MAE = 0.93 pts/player/gameweek, top-20 precision
  (overlap between predicted and actual top 20 scorers) = 14%. Reads as:
  the model is meaningfully better than chance at *ranking* players
  (Spearman 0.70), noticeably worse at nailing the *exact* points total
  (Pearson 0.57) - expected, given how much of FPL scoring (bonus points,
  explosive one-off hauls) is inherently high-variance. No strong
  systematic bias by position (mean predicted-minus-actual error is
  within ±0.06 pts for every position) and accuracy is stable across the
  season rather than degrading late on.
  **Found via a live-app report, not the backtest**: `compute_player_involvement_shares()`
  (splits a predicted team goal tally down to individual players by each
  player's historical share of their team's goals/assists) had no
  regularization at all, unlike `compute_team_goal_strengths()` below -
  a report that Bruno Fernandes was predicted 2.0 goals and 4.2 assists
  over a 5-gameweek window traced back to a recency-weighted assist_share
  of 0.505 (half of Man Utd's *entire* modeled assist output credited to
  one player), off a season where he had 24 of the team's 60 actual
  assists (40%) even before recency-weighting toward a strong finish
  pushed it higher. Fixed two ways (`team_model.py`'s
  `compute_player_involvement_shares` docstring has the full reasoning):
  switched from actual goals/assists (small-integer outcome counts that
  bake in finishing variance - regression to the mean) to xG/xA (FPL's
  own Opta-sourced chance-quality estimates, already in `gw_history` but
  unused until now - standard practice in football analytics for
  exactly this reason); and added Dirichlet-style additive smoothing
  toward a *position-average* share (`SHARE_SMOOTHING_ALPHA` - a flat,
  position-blind prior was tried first and rejected, since it pulled
  defenders' correctly-low goal/assist involvement up toward attackers'
  and made the backtest's DEF bias meaningfully worse; see `tune.py`'s
  `search_alpha()`). Net effect on the backtest above: Pearson r² 0.30 ->
  0.32, position bias roughly halved, and (the number this was actually
  tuned against) 5-gameweek-window top-20 precision 16.5% -> 18.2% (see
  `multi_gw_backtest.py` below) - a real, measured accuracy gain, not
  just a fix for one embarrassing number.
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
  noise out and reveal it. It does, cleanly: r² goes from 0.32 (1 GW) to
  0.48 (3 GW) to 0.52 (5 GW), top-20 precision from 14% to 16% to 18%,
  with no change to the model itself. Conclusion: the single-gameweek ceiling is mostly
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
  manager's picks still exist for. Not fully worked around yet, and not
  even consistent within one account: a real user reported Chip Strategy
  working with their team id while My Squad failed with it, because
  `build_chip_strategy` derives its scan basis from the manager's own
  `current_event` (whatever FPL still reports) while `/api/squad/{team_id}`
  defaulted to a hardcoded `event=38` - if this manager's GW38 picks
  specifically aren't servable anymore but an earlier gameweek still is,
  one endpoint works and the other doesn't for the exact same team id.
  **A second, compounding bug found alongside it**: these three endpoints
  called `fetch_entry_info`/`fetch_entry_picks` without catching the
  `requests.HTTPError` FPL's 404 raises, so the failure reached the
  frontend as an unhandled exception - a raw Starlette 500. Confirmed
  directly against the deployed backend that this is worse than just an
  unhelpful error: Starlette's `ServerErrorMiddleware` (which catches
  genuinely unhandled exceptions) sits *outside* `CORSMiddleware` in the
  default middleware stack, so that 500 response never gets an
  `Access-Control-Allow-Origin` header - the browser blocks the frontend
  from ever reading it, and `fetch()` throws a bare, unexplained "Failed
  to fetch" instead of anything mentioning FPL, picks, or a season
  boundary. HTTPExceptions (already used elsewhere, e.g. `/api/players/{id}`'s
  404) don't have this problem - FastAPI's own exception handling for
  those sits *inside* CORSMiddleware, so the headers get added correctly
  (verified with curl against both a raw-exception and an HTTPException
  endpoint on the live deployment - only the former was missing the
  header). All three endpoints now catch the FPL HTTPError and re-raise
  as an HTTPException with a message that actually explains what
  happened, and the frontend (`frontend/src/lib/api.ts`'s `fetchJson`)
  surfaces that message instead of a generic "Request failed (404)".
- **Squad Builder** (originally its own `/squad-builder` route, since
  merged into `/squad` as a "Build from scratch" mode alongside "Load my
  team" - one page, a toggle between the two, so the same screen works
  before the season locks your first real squad in) is a manual drafting
  tool, distinct from both `optimizer.py` (automated, from-scratch or
  transfer-based) and loading a real existing squad: pick your own 15 within
  budget and get live diagnostic feedback as you go, each paired with
  concrete affordable players (filtered to positions you still need,
  where any remain) to fix it, one click to add. Ten checks, each
  computed from the actual squad rather than a generic template - club
  concentration (3+ from one team), missing exposure to one of the
  league's easier upcoming fixture runs, a tough run among teams you
  already own, no recognized primary penalty/free-kick/corner taker (3
  separate checks - full set-piece coverage, not just penalties),
  injured/doubtful/suspended players already in the squad (named, with
  FPL's own news text), rotation/gametime risk (players whose own
  recent minutes history says they're not a nailed starter, via
  `appearance_points` - see `team_model.py`), value per position
  (players returning meaningfully less per £m than comparable players
  at their position), and underperforming positions (a position whose
  squad average predicted points sits well below what the position's
  realistic contenders are producing). The value/underperformance
  checks compare against the top ~24 predicted-points players at each
  position, not the full ~140-deep pool - most of that pool is bench
  players who'll never start, so comparing against the whole thing
  would set a bar too low to mean anything. This was deliberately kept
  rule-based rather than routed through an LLM: instant, free, and
  fully deterministic, at the cost of writing (and reading) each check
  by hand rather than asking a model to reason freeform over the squad.
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
- **Caching, once the page count grew.** As more pages landed on the same
  prediction pipeline (`/api/players`, player detail, alternatives, on
  top of Squad Builder/Optimizer/Outlook), that remaining ~0.7s per
  request turned out to still be dominated by two things happening from
  scratch on *every single call*: `load_bootstrap()`/`load_fixtures()`
  re-parsing the same ~1.4-2.7MB JSON files (they were never cached,
  unlike `load_gw_history()`), and the full per-player, per-gameweek
  prediction loop re-running even when `_build_prediction_context()`'s
  setup was already cached. Fixed with `@lru_cache` in three places:
  `load_bootstrap`/`load_fixtures` (keyed by filename - these files
  don't change during a process's lifetime anyway), `_build_prediction_context`
  (keyed by its own arguments - `datetime` hashes by value, so the same
  demo reference_date across requests hits the cache), and a new
  `_predict_multi_gw_breakdown_cached` inner function behind
  `predict_multi_gw_breakdown`/`predict_multi_gw_points` (keyed the same
  way, with `next_events` converted to a tuple since lru_cache needs
  hashable arguments and it's normally a list). Measured: `/api/players`
  warm-cache dropped from ~700ms to ~20-60ms - about 15-20x - with the
  first request per process still paying the full ~1.5s cold cost once.
  Verified as behavior-preserving the same way as above: identical
  top-N predicted-points output before/after, both on the archived-only
  path (Outlook/backtest) and the live-roster path.
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
- **All Players, Player Detail, Schedule, and Leagues pages.** Every
  player in the live 2026/27 game is browsable (`/players`, sortable,
  searchable) and clickable through to a full detail page
  (`/players/{id}`: live identity/price/status, 2025/26 season totals,
  a per-gameweek points chart, and the model's predicted-points
  breakdown by category for the next few gameweeks) - and every player
  name across the whole app (Outlook, Differentials, My Squad, Squad
  Builder, Optimizer) now links there too. Both modes of `/squad`
  can also surface 3-5 same-position alternatives for any player on
  demand (`/api/players/{id}/alternatives`) - a quick "who else could I
  play here" without leaving the page. `/schedule` shows the full
  2026/27 fixture list one gameweek at a time (with results once
  played). `/leagues` shows a manager's classic mini-leagues, their
  standings, and a gameweek-by-gameweek total-points line chart per
  member.
  - **Player comparison, on the detail page.** Add up to 4 other
    players (search by name/team) to compare side-by-side against
    whoever's page you're on - predicted-points breakdown and 2025/26
    season totals as a table, each comparison column marked with a
    green ▲/red ▼ against the primary player's number, plus every
    added player's gameweek-by-gameweek points overlaid on the same
    chart (`frontend/src/lib/palette.ts` picks each line's color,
    deliberately skipping the primary player's hardcoded pl-purple -
    that color is also the palette's first entry, so naively indexing
    into it for the first comparison player recreated the exact same
    color and made the two lines indistinguishable until caught).
    With no comparison players added, the chart instead overlays a
    dashed least-squares trend line (`frontend/src/lib/trend.ts`) over
    the single player's raw points, since one jagged line alone shows
    less about form direction than the same line with a trend
    through it.
  - **Two id-space bugs, found and fixed in the same pass.** Several of
    these endpoints score players against the *archived* 2025/26
    bootstrap (`/api/players/scores`, `/api/players/predicted-points-outlook`,
    `/api/squad/{team_id}`) but need to link to the *live* 2026/27
    player-detail page - the exact archived-vs-live id mismatch this
    file already documents at length for team ids and (more recently)
    player ids. `analysis.map_archived_ids_to_live()` resolves this the
    same way `team_model.py` does (matching FPL's stable `code` field),
    attaching a `live_id` alongside the archived-season `id` so the
    frontend never has to reason about which id space a page is in.
  - Getting `live_id` into the JSON response surfaced a second, subtler
    bug: assigning a dict with some `None` values onto a DataFrame
    column via `.map()` silently upcasts the column to `float64`,
    turning `None` into `NaN` - and Starlette's `JSONResponse` sets
    `allow_nan=False`, so a single `NaN` anywhere in the payload 500s
    the *entire* endpoint (a real bug this project hit while building
    this feature, not a hypothetical - `curl` showed a bare `Internal
    Server Error` with no other detail). Re-assigning a plain Python
    list of `int`/`None` back into the column doesn't fix it either -
    pandas re-triggers the same upcast on assignment. The fix
    (`analysis.nullable_int_column()`) has to pin `dtype=object`
    explicitly at Series construction time.
  - The Leagues trend chart is honest about a real limitation, not
    silently broken: FPL's `/entry/{id}/history/` only keeps
    gameweek-by-gameweek scores for the *current* season - 2025/26 is
    now "past" and collapsed to one aggregate row per season, and
    2026/27 has zero gameweeks played as of writing, so `/leagues`
    currently shows a clear "no standings yet" state rather than an
    empty chart. It's wired to real data and will fill in once 2026/27
    gameweeks start completing. Standings fetches are capped at 20
    league members (`LEAGUE_STANDINGS_ENTRY_CAP`) since each one needs
    its own live API call for history - unbounded would mean hundreds
    of requests for a large public league.
- No chatbot yet (deferred - would need an Anthropic API key and a small
  recurring cost).
- **Price Watch** (`/price-watch`, `/api/players/price-watch`) ranks
  players by today's net transfers in/out (FPL's own bootstrap-static
  data: `transfers_in_event`/`transfers_out_event`, which count net
  transfers since the *last* price change and reset to 0 when one
  happens) as a heuristic for who's likely to move £0.1m at the next
  price update (~2:30am UK). Explicitly NOT a claim to have
  reverse-engineered FPL's real algorithm - that's proprietary and has
  never been published; this uses the same raw signal community trackers
  (LiveFPL, Fantasy Football Scout) are built on, without guessing at
  FPL's actual (unknown, reportedly ownership/price-band-dependent)
  threshold. Ranks by *absolute* net transfers, not transfers-as-%-of-
  ownership (`momentum_pct`, still returned per player for context) -
  the percentage blows up into huge, meaningless numbers for barely-owned
  players (a 0.1%-owned player moving 2,500 net transfers showed up as
  "500%" in testing), so it's supplementary, not the ranking key.
  `MIN_NET_TRANSFERS_TO_FLAG` (500) filters out noise from tiny swings on
  fringe players before anything is shown at all.

  Also surfaces a transfer *rate* (`transfer_rate_per_hour`) when enough
  history exists: the ingest workflow snapshots bootstrap-static every 6
  hours and keeps every fetch as its own `raw_snapshots` row rather than
  overwriting the latest (`db.read.recent_bootstrap_snapshots`), so the
  time series needed to see whether momentum is building or just a
  one-off blip was already being collected - nothing was reading it for
  this until now. Correctly detects and omits (rather than
  misreporting) any player whose count *decreased* somewhere in the
  window, which means a price change reset the counter partway through,
  not that transfers reversed.

  FPL's own `price_change_percent` field (bootstrap-static) is passed
  through as `official_progress_percent` - premierleague.com announced a
  "Price Change Predictor" for 2026/27 that sounds like exactly this
  figure, updated every 15 minutes on FPL's own site, but every
  element's value is still 0 as of writing (no 2026/27 transfer activity
  yet), so its sign convention/scale couldn't be verified against real
  data and isn't used by the ranking logic - surfaced for reference only.
  No on-disk fallback for the snapshot history (unlike bootstrap/fixtures
  elsewhere in this app) - there's only ever one bootstrap JSON file per
  season on disk, not a time series of them, so DB-unreachable and
  DB-has-no-history-yet both just mean "no trend data yet"
  (`has_history_trend: false`) rather than an error.
- **Landing page: onboarding for a new visitor, dashboard for a returning
  one.** (`frontend/src/components/home/`) The page's job changed from
  cataloguing every route (an 8-card "Model:/Use it for:" grid, dropped
  down to a compact icon-chip strip - each page already explains itself
  once you're on it) to actually walking a visitor through setup.
  `HomeBody` switches on `useTeam()`'s connection state between:
  - `GetStartedSteps` - a 3-step flow (connect/build -> get
    recommendations -> track your gameweek). Not purely decorative: step
    1 reads real connection state and its CTA calls `promptConnect()`
    directly - opens the real connect dialog in place, and once
    connected shows the manager's name instead of a generic prompt.
    Deliberately built state-aware rather than as static marketing copy,
    since it's meant to be the seed a future first-time-use tutorial
    builds on.
  - `Dashboard` - once connected, replaces the steps with the manager's
    own numbers: last gameweek's score (`/api/squad/{id}`, already-built
    endpoint) and overall rank, squad "weak points" (derived client-side
    from the same response - injured/doubtful/suspended players via a
    `status`/`news` pair newly exposed on `build_squad_analysis`'s squad
    rows, which weren't returned to any endpoint before this; high
    rotation-risk starters; teams with a tough upcoming run), squad
    value/bank/captain, and price watch for specifically the manager's
    *own* players - via a new `player_ids` filter on
    `/api/players/price-watch` that skips both `MIN_NET_TRANSFERS_TO_FLAG`
    and the top-N `limit`, since a manager wants every one of their own
    players' signal, not just the league-wide "big enough to matter" cut.
    Pre-season, `/api/squad/{id}` 404s for every manager (FPL has no pick
    history until a gameweek locks) - `Dashboard` treats that as an
    honest waiting state ("unlocks once your first gameweek locks"), not
    an error, and upgrades to the real dashboard automatically once the
    season starts, no season-boundary logic needed on the frontend.
- **Player photo fallback** (`frontend/src/components/ui/PlayerPhoto.tsx`).
  Roughly a third of players have no shot on the official PL photo CDN at
  either served size (see `player_photo_url`'s docstring) - previously
  every `<img>` just hid itself on a 404, leaving an empty gap in the
  pitch view rather than showing anything. `PlayerPhoto` tracks its own
  load-failure state and falls back to an initials avatar (the same
  treatment the sidebar already used for a connected manager with no
  team crest), used everywhere a player photo renders: the pitch view,
  bench avatars, the transfer planner table, and the player detail page.
- **Differentials' ownership is live, not archived.** `compute_player_scores`
  (recommendation_score) is deliberately pinned to the archived 2025/26
  season (see its docstring), which by default carries that season's
  final `selected_by_percent` too - fine for the score itself, wrong for
  "who's actually a differential right now." `/api/players/scores`
  overlays live `selected_by_percent` (matched by the stable `code`
  field) before filtering/ranking, so both the `max_ownership` cutoff
  and the displayed % reflect this season's actual picks-so-far, not
  GW38 of last season. Confirmed via each bootstrap file's own
  `total_players`: ~525k on the live file (climbing pre-season, GW1 not
  yet played) vs ~13.1m on the archived one (2025/26's final count).
- **Blog** (`/blog`, `/blog/[slug]`) is a Markdown-file-backed content
  section, not a DB table or CMS - posts are plain `.md` files with
  frontmatter (`title`/`date`/`excerpt`/`tags`) under
  `frontend/content/blog/`, read and parsed (`gray-matter` + `marked`) at
  request time by `frontend/src/lib/blog.ts`. Deliberately the simplest
  thing that works for how posts actually get written: a post is authored
  on request, saved as a new file, and committed - no admin UI, auth, or
  migration needed for that workflow. The homepage surfaces the newest
  post in a "Latest from the blog" teaser card. As of writing there are
  6 posts, seeded with genuine research (WebSearch, cross-checked across
  multiple sources) plus figures pulled directly from this app's own
  live model/fixture data where relevant (e.g. the fixture-swings and
  budget-enablers posts), not fabricated numbers.

  Cover art (`frontend/src/components/blog/BlogCover.tsx`) is built from
  the same official CDN images used everywhere else in the app - team
  badges and player photos (`resources.premierleague.com`, the same
  source as `analysis.py`'s `team_badge_url`/`player_photo_url`) - not
  stock photography, which this app has no rights to. A post's
  frontmatter declares a `cover: { type: player | badges | gradient,
  ... }`; `gradient` (a plain on-brand banner, no external image) is the
  default for posts with no single team/player to headline, and doubles
  as the fallback if a CDN image 404s.
- **Backend cold starts on Render's free tier.** The deployed backend
  (`fpl-assistant-backend`, see `render.yaml`) runs on Render's free
  plan, which spins the service down after ~15 minutes of no traffic -
  the next request pays for both the container cold-start and (since
  the free plan's disk is ephemeral) re-fetching `bootstrap-static`/
  `fixtures` live from the FPL API via `ensure_data_fetched()`, on top
  of the actual model computation. Measured: ~35s on a genuinely cold
  request, ~3s once warm (the warm number is real work now - see the
  caching entry above; the cold number is almost entirely Render spin-up,
  not app code). `.github/workflows/keep-backend-alive.yml` pings
  `/api/health` every 10 minutes (inside Render's 15-minute idle window)
  to keep the free instance from sleeping at all - remove that workflow
  if the backend ever moves to a plan that doesn't sleep, since it'd be
  dead weight at that point. A paid Render plan removes the sleep/ephemeral-disk
  behavior entirely and is the more robust long-term fix, but that's a
  hosting-cost decision, not something this repo can decide on its own.

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

### Database (local Postgres = RDS in prod)

The app reads its data from Postgres, not the on-disk snapshots (those remain
a fallback if the DB is empty/unreachable). Locally, run the same engine RDS
hosts via a container; in prod, point `DATABASE_URL` at the RDS instance
instead - no code change. Schema is managed by Alembic; ingestion is idempotent.

```bash
# 1. Start local Postgres (Podman or Docker) - see docker-compose.yml
podman compose up -d

# 2. Apply the schema
cd backend && venv/bin/alembic upgrade head

# 3. Backfill: archive (2025/26) snapshots + gw-history CSV, and the live
#    2026/27 roster - so the DB starts with everything the files held
venv/bin/python -m fpl.data.ingest backfill

# Thereafter, refresh from FPL (snapshot bootstrap+fixtures, ingest any
# newly-finished gameweeks). Idempotent - safe to run repeatedly:
venv/bin/python -m fpl.data.ingest run
venv/bin/python -m fpl.data.ingest status   # row counts + recent ingest runs
```

`.github/workflows/ingest-data.yml` runs `fpl.data.ingest run` on a schedule
against the production DB (needs a `DATABASE_URL` repo secret) - that's the
"update after each game is played" trigger. `backend/fpl/data/db/` holds the
models/session, `backend/fpl/data/ingest/` the pipeline + backfill,
`backend/fpl/config.py` the settings, and `backend/alembic/` the migrations. `raw_snapshots` stores bootstrap/fixtures verbatim (so
`load_bootstrap`/`load_fixtures` reconstruct byte-identical structures);
`player_gw_stats` is the normalized, append-only per-gameweek history. The
walk-forward backtest run against the DB reproduces the file-based baseline
exactly (Pearson 0.549, Spearman 0.730, MAE 0.921 - see the numbers above),
confirming the repoint is faithful.

Run the API:

```bash
venv/bin/python -m uvicorn fpl.api.main:app --reload
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
