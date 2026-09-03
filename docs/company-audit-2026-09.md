# xFPL — Company and Technical Audit

**Date:** 3 September 2026 · **Prepared for:** Steven · **Prepared by:** AI executive team (CEO / CTO / Head of FPL Analytics)
**Scope:** read-only inspection of the repository, the live deployment's own health endpoints, and CI history. No code changed.
**Season context:** 2026/27, GW1–GW2 played, GW3 deadline Friday 4 September 17:30 UTC.

---

## PART 1 — EXECUTIVE SUMMARY

### What xFPL currently is

xFPL is a live, working Fantasy Premier League decision-support web app at **xfpl.co.uk**. A manager pastes their FPL team ID and gets, for the gameweek ahead: a projected score for every player in their squad, a captain recommendation, suggested transfers, a multi-week transfer plan, chip timing, and rival/league analysis — each with a one-line plain-English reason assembled from the numbers that produced it.

It is a two-part monorepo: a **FastAPI/Python** analysis engine (~9,700 lines in the app package, ~13,400 with tools and tests) and a **Next.js 16 / React 19 / TypeScript** front end (~18,800 lines). It runs on free tiers end to end, at a current cash cost of **£0/month**.

### How it works

1. A GitHub Actions cron pulls FPL's public API **hourly** and stores a verbatim snapshot in Postgres. If the database is unreachable, the app serves committed on-disk snapshots instead and stays up.
2. A **Dixon-Coles-style team-strength model** estimates each side's expected goals for a fixture from recency-weighted, xG-based attack/defence ratios.
3. Those team goals are split across players by each player's historical share of their team's goals and assists, then converted into **every FPL scoring category** — appearance, goals, assists, clean sheets, goals conceded, bonus, saves, cards, own goals, and the 2025/26 defensive-contribution rule.
4. The result is both an expected value *and* a reconstructed outcome distribution, so the app can state a haul probability and a ceiling rather than only a mean.
5. An **integer program** (PuLP/CBC) turns projections into an actual constrained decision: 15 players, £100.0m, max 3 per club, free transfers accruing and hits charged, solved across a multi-week horizon rather than one week at a time.
6. Every gameweek's projection is **frozen to a dated file before the deadline** and graded publicly afterwards on the /accuracy page.

### Strongest features

- **Intellectual honesty as a product feature.** The `/accuracy` page publishes the model's record — captain call, top-ten average, rank correlation, and error by return category against a "average their last five games" baseline. `docs/openfpl-evaluation.md` states in writing where a rival open-source model beats xFPL and why it has not been adopted. This is rare and it is defensible positioning.
- **A genuine pre-commitment mechanism.** GW3's projection was frozen at `2026-09-03T19:10:40Z`, attributed to commit `a96ee3d`, before the deadline. That converts "trust us" into something falsifiable.
- **Engineering quality well above the stage.** Clean layering (routers → services → domain/model/optimize → data), 178 backend tests, green CI on `main`, golden response snapshots that generate the frontend's TypeScript types so the two cannot drift. Nearly every non-obvious constant carries a comment explaining the evidence behind it — including several documenting experiments that were **tried and rejected**.
- **Real optimisation, not a ranked list.** The horizon optimiser expresses trades a per-week solve cannot ("take a −4 now to have him for three weeks").
- **Operational resilience for £0.** File fallback, edge caching with stale-while-revalidate, startup warmup, snapshot pruning with a documented steady state, and a data-freshness alarm.

### Biggest weaknesses

- **Nobody can find it, and nothing measures whether they do.** `robots.txt` and `sitemap.xml` both 404. Every page shares one title ("xFPL") and one description; there are no OpenGraph or Twitter card tags, so 21 blog posts share as bare links. There is **no analytics of any kind** — not one page view is recorded. Every growth decision is currently being made blind.
- **The model is weakest exactly where FPL is decided.** Against its own baseline, xFPL is ~20–24% better at predicting Zeros and Blanks and **0.5% better on Haulers** — players who score 5+. Two rival models are ~8% better there. Haulers win gameweeks.
- **The two headline accuracy numbers are not comparable, and the flattering one is in the docs.** The backtest's Spearman 0.704 is computed over all ~600 players including those who never played; the live accuracy page computes it over players who actually appeared, and reports 0.20 and 0.32. Both are honest; quoting them side by side is not.
- **No user identity, no retention loop.** Team ID lives in `localStorage`. No accounts, no email, no notifications — nothing brings a manager back next Friday except memory.
- **A "Premium" paywall that leads nowhere.** `/squad` blocks tracking a 4th rival team with "🔒 Premium lifts the cap" — there is no Premium, no accounts, and nothing to buy. It withholds a working feature for no revenue, in the one product that sells itself on honesty.
- **The README is materially wrong.** Its 776 lines describe `analysis.py`, `team_model.py`, `my_squad.py` and `chip_strategy.py` — none of which exist — and state "No dark mode" for an app that is dark by default.

---

## PART 2 — TECHNICAL AUDIT

### Architecture overview

```
backend/     FastAPI service — 33 routes across 7 routers
  fpl/api/         routers, CORS, cache-control middleware, startup warmup
  fpl/services/    orchestration per product area
  fpl/domain/      FPL rules & product logic (scoring, chips, accuracy, rationale, ownership…)
  fpl/model/       the prediction model (strengths, involvement, predict, distribution, rules)
  fpl/optimize/    ILP squad + multi-gameweek transfer optimiser (PuLP/CBC)
  fpl/data/        loaders (DB-first, file fallback), ingest pipeline, SQLAlchemy models
  tools/           eval (backtest, tuning, experiments), freeze, data prep — not shipped in requests
frontend/    Next.js 16 App Router (app/ → features/ → shared/)
data/        committed FPL snapshots + frozen projections + published accuracy record (~12 MB)
```

### Technology stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16.2.11, React 19.2.4, TypeScript 5, Tailwind v4, `motion`, `marked`+`gray-matter` for the blog |
| Backend | Python 3.12, FastAPI 0.139, pandas 3, PuLP 3.3 (CBC), pydantic-settings |
| Database | PostgreSQL via SQLAlchemy 2 + Alembic. Three tables: `raw_snapshots` (JSONB), `player_gw_stats`, `ingest_runs` |
| Hosting | Backend: Render free web service (`render.yaml`). Frontend: separate host serving `xfpl.co.uk`. DB: recommended Neon free tier |
| Edge | CDN in front of the API; route-keyed `Cache-Control` policy table, `no-store` by default |
| Scheduling | GitHub Actions only — hourly ingest, 4×/day projection freeze, 6-hourly freshness check, 10-minute keep-alive, weekly fallback-snapshot PR |
| Third-party data | FPL public API; Premier League image CDNs (badges, kits, photos); `vaastav/Fantasy-Premier-League` community archive for gameweek history |
| Auth | **None.** Identity is an FPL entry ID in `localStorage` |
| Secrets | `DATABASE_URL`, `ALLOWED_ORIGINS` (both `sync: false`, set in dashboards, not in git). No secret values appear in the repository |

### Deployment overview

Backend deploys from `render.yaml` (free plan, sleeps after ~15 idle minutes, ~35s cold start). A 10-minute keep-alive ping prevents that. Frontend deploys separately. All scheduled work runs on GitHub Actions; there is deliberately no paid Render cron. The `freeze-projections` workflow holds `contents: write` and pushes directly to `main` — documented as a deliberate trade (a PR awaiting review would miss the deadline the file exists for) and mitigated by the file being additive, never overwriting, and never touching code.

**Verified live at time of audit:** `/api/data-status` returned `source: database`, `snapshot_age_hours: 1.9`, `stale: false`. `xfpl.co.uk` returned HTTP 200. CI run #14 on `main`: green.

### Key technical concerns

1. **No error tracking or uptime alerting.** The only alarm is a 6-hourly workflow that fails (and emails) when data goes stale. A 500 on `/api/squad/{id}`, a frontend exception, or a slow route is invisible.
2. **No headroom on the free tier.** The keep-alive consumes ~730 of 750 free instance-hours a month. There is no room for a second free service, and no capacity plan if traffic arrives.
3. **Single point of failure at the FPL API.** Every projection depends on one upstream with no contract, no SLA, and a history of reshaping ids each season. Mitigated by snapshots and file fallback; not eliminated.
4. **Two competing player scores ship side by side.** `recommendation_score` (hand-set weights: 0.4 expected returns, 0.2 form, 0.15 minutes, 0.3 quality, 0.15 defensive, ×0.4 opponent) has **never been backtested**, yet is rendered to users in My Squad as a "Score" to three decimal places, beside a projection that has been. See Part 4.
5. **Season-transition fragility is real and acknowledged.** FPL reassigns team and element ids alphabetically each season; the code guards this with explicit name/code remaps and paired `bootstrap_file`/`fixtures_file` parameters. The guards are good; the class of bug is severe and one careless default flip re-introduces it silently.
6. **Ingest workflow can pass while doing nothing useful.** A missing `DATABASE_URL` shows as an annotation on a green run.

### Technical debt

| Item | Evidence | Severity |
|---|---|---|
| README describes a module layout that no longer exists | `analysis.py`, `team_model.py`, `my_squad.py`, `chip_strategy.py` referenced throughout; none exist. "No dark mode" stated; app is dark by default | **High** — it is the onboarding document, and it will mislead every future contributor and AI session |
| `docs/FRONTEND_REFACTOR_PLAN.md` says "Status: proposal. Nothing here is executed yet" | Fully executed: its 14 duplicated `API_URL` definitions are now 1; its 16 raw `fetch()` calls are now 0 | Medium |
| `anthropic==0.118.0` pinned in `backend/requirements.txt` | Zero imports anywhere in the codebase; installed on every deploy | Low |
| `API_FOOTBALL_KEY` plumbed through `render.yaml` and `.env.example` | Zero references in code | Low |
| Large frontend components | `BuildSquadPanel` 826 lines, `LoadTeamPanel` 655, `OptimizePanel` 496 | Low–Medium |
| Weekly snapshot commits grow git history | ~1.6 MB bootstrap re-committed weekly by `refresh-fallback-snapshot`; `.git` is 4.4 MB today | Low, but compounding |

**On balance:** this is a well-maintained codebase with unusually good documentation *inside* the code and unusually stale documentation *around* it. There is no test-coverage crisis, no architectural mess, and no scaling emergency. The debt is documentation drift and missing observability, not structure.

---

## PART 3 — PRODUCT AUDIT

### Current user journey

**New visitor →** lands on a hero ("Every recommendation, explained in a sentence"), a guided three-step setup, a worked example, the current matchday fixtures, and the three most recent blog posts.
**→ Connects a team** by pasting an FPL team ID or URL (no account, no email, no password).
**→ Home becomes a cockpit** showing their team's live position and last week's captain review — including what ignoring the model's captain pick actually cost them.
**→ /squad** is the core surface: pitch view, per-player projections, captaincy options with "why not them?", suggested transfers, a hit calculator, a multi-week transfer plan, chip timing, and a differentials read.
**→ Supporting pages:** Players (sortable table on desktop, cards on mobile), Leagues (effective ownership vs rivals), Matches/Fixtures, Teams, Price Watch, Accuracy, Blog.
**→ Return visit** depends entirely on the manager remembering to come back. There is no email, no notification, no reminder.

### Product strengths

- **The explanation is the product.** Every recommendation carries a sentence derived from the figures that produced it, never generated prose. "Why not X?" exists for players, the armband, taking a hit, and chip timing — and answers honestly when the user's own idea is better.
- **Decision coverage is complete.** Transfers, captaincy, chips, hits, rivals and price movement are all addressed; a manager does not need a second tool for a normal week.
- **The accuracy page is a genuine differentiator.** Almost no competitor publishes a falsifiable record, and none publish a pre-committed one.
- **The season replay is the right framing.** The model plays its own season under real rules — selling price, transfer accrual, hits, auto-subs, vice-captain — and reports 145 points across GW1–2 against a field total of 131, ranking 2,561,918 of 10,366,167 (~top 25%). It states on the page that it plays no chips, so the number is a floor.
- **Honest by construction.** Reconstructed gameweeks are labelled as reconstructions where the number is, not in a footnote.

### Product weaknesses

- **No reason to return.** The single largest product gap. FPL is a weekly ritual with a hard deadline; a tool with no deadline reminder is fighting for a habit it never prompts.
- **No shareable artefact.** Nothing produces an image or link a manager wants to post in their mini-league chat — the natural viral loop in this category, and the cheapest acquisition channel available.
- **The Premium tease.** A hard-coded 3-team tracking cap gated behind a "Premium" that does not exist. It costs a real feature and contradicts the brand.
- **`recommendation_score` shown to three decimals.** False precision on the one number with no accuracy record behind it.
- **Onboarding assumes FPL fluency.** "Effective ownership", "differentials", "defensive contribution" and a raw team ID are asked of a visitor who may not know any of them.
- **No first-run value without a team ID.** A visitor who won't paste an ID sees mostly marketing.

### Missing functionality

| Gap | Why it matters |
|---|---|
| Deadline reminder (email or push) | The retention mechanism the product is shaped for and does not have |
| Accounts / identity beyond `localStorage` | Team is lost on a new device or a cleared browser; no cross-device continuity |
| Shareable weekly card | The category's cheapest growth loop |
| Watchlist alerts on price change / injury news | Price Watch shows data but never tells you |
| Anything to buy | No monetisation path exists, including a free one to test demand |

---

## PART 4 — FPL ANALYTICS AUDIT

### Current methodology

**Inputs:** FPL public API (bootstrap-static, fixtures, entry/picks/history) hourly; `vaastav/Fantasy-Premier-League` gameweek-by-gameweek archive for 2025/26; an accruing 2026/27 gameweek history. **FPL-API-only for live signals** — no Understat, no scraped xG, no odds, no injury feed, no lineup leaks.

**Pipeline:**
1. **Team strength** — recency-weighted goals for/against, home/away split, normalised to league average, shrunk toward 1.0 by `weight/(weight+3)`. Trained on **team-aggregated xG rather than actual goals** (`TEAM_XG_WEIGHT = 1.0`).
2. **Fixture xG** — Dixon-Coles multiplicative form: `league_avg × attack × opponent_defence`.
3. **Player share** — recency-weighted share of the team's xG/xA, with additive smoothing toward a position-average prior (`SHARE_SMOOTHING_ALPHA = 0.5`).
4. **Scoring** — every FPL category. Clean sheets and conceded goals via Poisson on opponent xG; saves and defensive contribution via Poisson around a recency-weighted personal rate; bonus, cards and own goals as flat recency-weighted personal rates.
5. **Distribution** — the outcome space is enumerated analytically (never simulated, to keep responses deterministic for the golden tests), conditioned on appearance, then recalibrated. Yields haul probability and a ceiling.
6. **Cross-season handling** — a 90-day half-life for pre-season prediction; promoted teams get a discounted prior (attack ×0.85, defence ×1.15); current-season data blends in as it accrues at weight `n/(n+3)`.
7. **Grading** — every gameweek frozen before its deadline, then graded on captain call, top-ten average vs field, rank correlation, and RMSE/MAE by return category against a last-5-matches baseline.

### Strengths

- **The baseline is the right one and it is unflattering.** Last-5-matches is the benchmark the OpenFPL paper uses for commercial services. Choosing a bar you can fail is the mark of a real evaluation.
- **Parameters were chosen by evidence, and negative results were kept.** `CONGESTION_APPEARANCE_WEIGHT` and `BONUS_FIXTURE_SENSITIVITY` are both `0.0` — tried, measured, rejected, and left wired up with the reasoning written down. That is a genuinely good research culture.
- **Shrinkage everywhere it is needed.** A documented real bug (a defence ratio of 4.16 producing ~8 expected goals for one match) is fixed structurally, not patched.
- **xG over actual goals at both levels.** Correct: a single match's score is a small-integer outcome carrying finishing variance.
- **Distribution modelling is the right response to the right diagnosis.** The team identified that a conditional mean structurally cannot express a tail event, and built the distribution rather than tuning the mean harder.
- **No leakage in the walk-forward design.** Every prediction uses data strictly before its deadline, and the season replay reads the same frozen projection the accuracy page grades, so the two cannot drift.

### VERIFIED FACTS

- CI is green on `main`; 178 backend tests pass (CI run #14, 3 Sep 2026).
- Live backend serves from the database, 1.9h old, not stale.
- 2025/26 walk-forward backtest, 31,117 predictions across GW2–38: pooled **Pearson r 0.572**, **Spearman 0.704**, **MAE 0.931**, top-20 precision **14.6%**, top-50 **25.8%** — computed over **all** players, including those who did not play.
- Live 2026/27 record, computed over **players who appeared only**: GW1 rank correlation **0.20** (310 graded), GW2 **0.318** (312 graded).
- GW1 top-ten averaged **3.2** actual vs a field average of **3.06**. GW2: **6.6** vs **2.86**.
- GW1 captain pick B.Fernandes scored **2** against a best of 17, finishing **148th**. GW2 the same pick scored **23** and was the gameweek's top scorer.
- Season replay: **145** points across GW1–2 vs a field total of 131 → rank **2,561,918 / 10,366,167**. No chips played. Both weeks reconstructed, not frozen.
- Category errors vs baseline (from `docs/openfpl-evaluation.md`): Zeros **−19.8%**, Blanks **−23.6%**, Tickers **−19.7%**, **Haulers −0.5%**. OpenFPL: −8.4% on Haulers. FPL Review: −7.9%.
- The top predicted decile hauls **30.9%** of the time against a **7.9%** base rate, and contains **39%** of all hauls. Haulers actually average **7.8** points; the model predicts **2.96** for them.
- Stated haul probabilities above 30% run hot: a stated **59%** delivered **44%**.
- GW3 projection frozen `2026-09-03T19:10:40Z`, 626 players, attributed to commit `a96ee3d`.

### REASONABLE ASSUMPTIONS

- Poisson for goals conceded, saves and defensive contribution counts. Standard, well-behaved, and the model reports its own distribution mean so divergence is detectable.
- Dixon-Coles multiplicative attack×defence form. The field-standard approach for football scorelines.
- xG as a more stable signal than actual goals at team and player level. Backed by this app's own grid searches, and independently well established.
- Shrinkage constant of 3 pseudo-games. Arbitrary but conservative, applied consistently, and its effect is documented.
- Selling price in the season replay (purchase + half the rise, rounded down). Matches FPL's actual rule.
- Free-transfer accrual derived from 400 top-ranked managers' public histories rather than assumed. Good empirical practice.

### UNVERIFIED ASSUMPTIONS

1. **The promoted-team prior (attack ×0.85, defence ×1.15).** The code says plainly these are "rough, commonly-cited" figures, **not calibrated against this app's backtest**. Three promoted sides are in the league now, and Hull have already beaten Manchester United and won twice in two games. This prior is currently wrong in a visible direction.
2. **The cross-season blend curve** `n/(n+3)`. Reaches 0.5 by GW3 and 0.77 by GW10 — fast for a three-match signal. The code states it is "asserted, not fitted" and cannot be validated without a second season transition. **We are inside the period where it matters most.**
3. **The 90-day cross-season half-life.** Chosen by matching resulting spread and rank-correlation back to an in-season baseline, not by out-of-sample test.
4. **Set-piece share boosts** (penalties +0.08, free-kicks +0.03, corners +0.04 to goal/assist share). Explicitly "flat, hand-calibrated".
5. **Bonus as a flat recency-weighted personal rate.** A documented approximation — real bonus is BPS-ranked within a match.
6. **`recommendation_score`'s entire weight vector.** Hand-set, never backtested, never compared to the projection it sits next to — and rendered to users as a "Score" to three decimals.

### POTENTIAL METHODOLOGICAL PROBLEMS

1. **The two headline accuracy figures are computed over different populations, and the flattering one is the one in the documentation.** The backtest fills non-players with zero and correlates across all ~600 (Spearman 0.704). The accuracy page grades only players who appeared (0.20, 0.32) — precisely because, as `accuracy.py`'s own docstring says, "six hundred zeroes correlate beautifully". Both are defensible in isolation; the README quotes 0.704. Anyone comparing the two will conclude the live model is far worse than advertised, or that we are picking numbers. **This should be fixed by reporting both on the same population, in both places.**
2. **The Haulers gap is the product's central analytics weakness.** A 0.5% edge on the category that decides gameweeks is, in practice, no edge. This is documented and un-closed.
3. **The captain metric grades a global top pick, not an ownable one.** The accuracy page's captain is the highest-projected player in the league — a manager may not own them. It is a clean model measure; it is not the manager's decision. The season replay covers this properly and should be the headline.
4. **Stated probabilities run hot above 30%.** Independence across scoring routes over-states the union, worst for exactly the multi-route players a captain pick lands on. `recalibrate` corrects it; the residual is documented and should stay visible.
5. **Two gameweeks is not evidence.** GW1 rank correlation 0.20 and a 148th-placed captain, then GW2 with the gameweek's top scorer, is noise in both directions. **No conclusion — good or bad — should be drawn from the live record before roughly GW8–10.** The current top-25% replay rank is equally provisional.
6. **`apply_live_signals` is enabled on the live path but never on the eval path.** Correct reasoning (a frozen archive's injury data would poison a backtest), but it means the configuration users actually receive has never been backtested end to end.
7. **No confidence intervals on the published record.** A rank correlation from one gameweek is reported as a point estimate.
8. **Single-source dependency.** FPL-API-only is a deliberate, well-argued choice — but it means no odds, no lineup news, and no independent xG.

### Recommendations for testing and backtesting

**Do first (cheap, high credibility):**
1. Report the same statistics over the same population in the backtest and the live record. Publish both an all-players and an appeared-only figure, labelled.
2. Add a spread or interval to every published per-gameweek number so one week cannot read as a trend.
3. Either backtest `recommendation_score` against the same baseline, or remove it from the UI. Do not ship an unvalidated number next to a validated one.

**Do during this season (the data is arriving weekly):**
4. Keep the freeze streak unbroken. It is the single most valuable asset being created right now and it costs nothing to maintain.
5. Track the promoted-team prior explicitly: log predicted vs actual for Coventry, Hull and Ipswich each week and re-fit once ~10 gameweeks exist.
6. Validate the cross-season blend curve retrospectively at season end — the first real chance to fit it.
7. Report the season replay's rank alongside a "field average manager" and a "template squad" comparator, so the number has context.

**Do when there is capacity (the real research problem):**
8. Attack the Haulers gap directly. `docs/openfpl-evaluation.md` already names the most promising untested path: keep the current model for availability and the low end, add a tail-specific model for haul probability. That evaluation should be run before the approach is chosen.
9. Re-run the OpenFPL comparison if it is ever retrained on 2025/26 or later — the strongest objection to adopting it disappears.

---

## PART 5 — PRIORITISED OPPORTUNITIES

Ranked by expected value to xFPL, not by technical interest. "Approval" reflects the brief: every production deploy needs Steven's sign-off; the column flags where a *decision* — not just a deploy — is his to make.

| # | Opportunity | Owner | Expected impact | Difficulty | Risk | Steven's approval |
|---|---|---|---|---|---|---|
| 1 | **SEO foundation** — `sitemap.ts`, `robots.ts`, `metadataBase` + canonicals, per-page `generateMetadata`, OpenGraph/Twitter cards. Turns 13 pages and 21 blog posts into discoverable, shareable surface | CTO | **High** — the only £0 acquisition channel, compounding | Low (1 PR, no app logic) | Low | Deploy sign-off |
| 2 | **Analytics instrumentation** — page views, entry pages, referrers, plus ~4 events (team connected, transfer plan viewed, accuracy viewed, blog read). Free tier only | CEO + CTO | **High** — every other decision is currently blind | Low | Low (choose a cookieless tool; privacy policy already exists) | Yes — tool choice |
| 3 | **Make the accuracy figures comparable and interval-aware** — same population in backtest and live record, published both ways, with spread | Analytics | **High** — credibility is the product; an inconsistency here is existential | Low | Low | Yes — methodology |
| 4 | **Remove the fake Premium gate** and either lift the 3-team cap or state the real reason | CEO + CTO | Medium–High — restores a working feature and removes the one dishonest surface | Very low | Very low | Yes — product |
| 5 | **Documentation truth pass** — rewrite the README against the actual tree; mark the refactor plan as delivered; drop `anthropic` and `API_FOOTBALL_KEY` | CTO | Medium–High — every future contributor and AI session currently starts from false information | Low | Low | No |
| 6 | **Retention loop: deadline reminder** — email or push, with the week's captain call and top transfer. Requires an identity decision (email capture, GDPR, sender costs) | CEO | **High** — the biggest product gap; FPL is a weekly ritual with a hard deadline | Medium–High | Medium (PII, deliverability, spend) | Yes — strategy + spend |
| 7 | **Shareable weekly card** — an image or link a manager posts in their mini-league chat ("my model week: 105 pts, captain called") | CEO + CTO | Medium–High — the category's cheapest viral loop | Medium | Low | Yes — product |
| 8 | **Close the Haulers gap** — evaluate a tail-specific model for haul probability, per the path `openfpl-evaluation.md` already names | Analytics | **High if it lands** — it is the category that decides gameweeks | High | Medium — a wrong tail model is worse than none; must clear the same public baseline | Yes — methodology |
| 9 | **Observability** — error tracking on both tiers plus uptime alerting, free tier | CTO | Medium — currently a 500 or a frontend crash is invisible | Low | Low | Yes — tool choice |
| 10 | **Free-tier capacity decision** — keep-alive uses ~730 of 750 monthly instance-hours. Decide now whether ~£7–14/month buys away cold starts and DB expiry risk, or whether we accept them until traffic justifies it | CEO | Medium — a decision, not work; deferring it is fine, not knowing it is not | Very low | Low today; high if traffic arrives unplanned | Yes — spend |

**Deliberately not on this list:** rewriting the model, adding a second data source, adding a CMS, and adopting OpenFPL wholesale. Each has been considered and each is either already argued against with evidence in the repository, or is premature at zero measured users.

---

## FIRST EXECUTIVE RECOMMENDATION (acting as CEO)

### 1. What is the single most important thing xFPL should do next?

**Make xFPL discoverable and measurable — items 1 and 2 above — before anything else.**

Concretely: ship SEO fundamentals (sitemap, robots, per-page metadata, OG/Twitter cards) and install free analytics with a small number of meaningful events. Then hold for two weeks and read the data before committing to anything larger.

### 2. Why this is more important than the alternatives

- **Every other decision is currently a guess.** We do not know whether xfpl.co.uk has ten visitors a week or ten thousand, which page they arrive on, or whether a single manager has ever connected a team. Prioritising model work, retention work, or content work without that is choosing with a blindfold on.
- **The product is already good enough to deserve traffic.** This is not a case of polishing something unfinished. The recommendations work, the reasoning is genuine, and the accuracy record is a real differentiator. The bottleneck is distribution, not quality.
- **It is days of work, £0, and permanently compounding.** SEO applied once keeps paying; a model improvement applied once has to be maintained and revalidated.
- **The strongest asset builds itself in the meantime.** The frozen-projection record accrues one gameweek per week whether or not we touch it. By GW10 it becomes genuinely persuasive — but only to people who can find it. Traffic work now and evidence work by itself is the right division of labour.
- **The model work is real but slow-feedback and capped.** Closing the Haulers gap is the correct *second* move. It needs weeks of research, needs the season to accrue data to validate against, carries a genuine risk of making the record worse, and improves a product nobody currently sees. Two gameweeks of live data is not enough to justify starting there.
- **Items 3, 4 and 5 are cheap and should ride along.** The accuracy-figure inconsistency and the fake Premium gate both undermine the one thing xFPL sells — honesty — and both are hours, not days.

### 3. The first three steps

1. **SEO foundation, one PR.** `sitemap.ts` and `robots.ts`, `metadataBase` and canonicals, `generateMetadata` per route (blog posts especially), and OpenGraph/Twitter cards reusing the existing badge/photo cover art. No application logic touched, no model touched. CTO plans it; Steven approves the deploy.
2. **Analytics, one PR.** A cookieless, free-tier tool. Page views, referrers, entry pages, plus four events: *team connected*, *transfer plan viewed*, *accuracy page viewed*, *blog post read*. Verify the existing privacy policy covers it before shipping.
3. **Read the data after 14 days and decide from evidence.** What gets found, what people do, where they leave. That reading — not this audit — should choose between the retention loop (#6), the shareable card (#7), and the Haulers research (#8).

Alongside all three, as low-cost hygiene: fix the accuracy-figure inconsistency (#3), remove the Premium gate (#4), and correct the README (#5).

### 4. What information is still missing

**Blocking a confident growth plan:**
- **Current traffic, and any existing measurement.** Is there a Google Search Console property, a host-level analytics dashboard, or anything already recording visits?
- **Where the frontend is actually hosted.** `DEPLOYMENT.md` says "its own host"; the repository does not name it. This determines how analytics and redirects are configured.
- **Discord community size and activity.** It is linked from every blog post and the home page; we have no idea whether it is one person or five hundred.

**Blocking specific decisions:**
- **Steven's monthly spend ceiling**, if any. This decides #10 and gates #6.
- **Appetite for collecting email addresses** — the retention loop is the biggest product gap and it cannot be built without that call.
- **Steven's own time budget**, particularly for the near-daily blog cadence during the season. 21 posts exist; that is the largest recurring human cost in the business and we should size it deliberately.
- **Whether monetisation is a goal this season or a later one.** It changes whether #4 removes the Premium gate or builds behind it.

**Not blocking, but worth knowing:**
- Whether any real manager other than Steven has used the app, and what they said.

---

**No changes have been made to the application. Awaiting Steven's direction before any implementation.**
