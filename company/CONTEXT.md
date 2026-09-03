# xFPL — Company Context

**Single source of truth for the executive team.** Every executive reads this before
analysing anything, so nobody re-derives the company from the repository each session.

**Last verified:** 3 September 2026, against the initial company audit
(`docs/company-audit-2026-09.md`), the repository, and the live deployment's own
health endpoints.

Anything not established by that audit is marked **UNKNOWN**. Do not replace an
UNKNOWN with a guess. Replace it with evidence, and date the change.

---

## Mission

Give a Fantasy Premier League manager a recommendation they can *argue with* —
every transfer, captaincy and chip call stated with the reasoning that produced
it, the range it might land in, and a public record of how the last call went.

Derived from the product's own hero copy and from `fpl/domain/rationale.py`,
which exists so that no recommendation ships without a sentence built from the
figures behind it. Not a slogan invented here.

## Product overview

A live web app at **xfpl.co.uk**. A manager pastes their FPL team ID — no account,
no password — and gets, for the gameweek ahead: a projected score for every player
in their squad, a captain recommendation, suggested transfers, a multi-week transfer
plan, chip timing, and rival/league analysis. Each carries a one-line plain-English
reason. Nothing in the product is written by a language model; every number in a
sentence is one the model computed.

- **Backend** — FastAPI / Python 3.12, ~9,700 lines in the app package (~13,400 with
  tools and tests). 33 routes across 7 routers. Layered:
  `api/routers → services → domain | model | optimize → data`.
- **Frontend** — Next.js 16 / React 19 / TypeScript / Tailwind v4, ~18,800 lines.
- **Model** — Dixon-Coles-style team strengths from recency-weighted xG, split across
  players by historical involvement share, expanded into every FPL scoring category,
  and reconstructed into an outcome distribution so a haul can be stated as a
  probability rather than smeared into a mean.
- **Optimiser** — integer program (PuLP/CBC) solving the real constrained decision
  across a multi-gameweek horizon, not one week at a time.
- **Accuracy record** — each gameweek's projection is frozen to a dated file before
  the deadline, attributed to a commit, and graded publicly afterwards.

## Current stage

Early. The product works and is live; the business around it barely exists.

- Season 2026/27, live and in progress.
- Live record: **2 graded gameweeks** (both reconstructed). GW3 is the first
  genuinely frozen pre-commitment.
- Users: **UNKNOWN** — nothing measures them.
- Revenue: none. No monetisation path exists, including a free one to test demand.
- Cost: **£0/month**, entirely on free tiers.

## Business objectives

Set by Steven, in priority order:

1. Improve the quality and accuracy of the product.
2. Create a genuinely valuable user experience.
3. Build sustainable traffic.
4. Avoid unnecessary expenditure.
5. Use AI efficiently rather than performing unnecessary work.
6. Establish strong foundations before scaling.

## Company principles

These are observed in the codebase, not aspirational.

- **Say why.** A recommendation without a reason is not advice. Every surface that
  ranks something also explains it, and answers "why not the other one?"
- **Publish the record.** The accuracy page grades the model against a baseline
  chosen because it is hard to beat, and reports the weeks it lost.
- **Never claim an improvement that has not been evaluated.** Two model parameters
  sit at `0.0` because the experiments rejected them, with the reasoning kept in the
  code rather than deleted.
- **State approximations rather than hiding them.** Selling price, bonus points,
  pruned candidate pools — each is documented where it is used.
- **Prefer the honest answer to the flattering one.** `docs/openfpl-evaluation.md`
  states in writing where a rival open-source model beats xFPL.

## Important constraints

| Constraint | Detail |
|---|---|
| **Cost** | £0/month today. Any spend needs Steven's approval. No monthly ceiling has been set — **UNKNOWN**. |
| **AI usage budget** | Limited. Do not re-analyse what is already documented; do not seat executives who are not needed. |
| **Free-tier capacity** | The keep-alive ping uses ~730 of 750 free Render instance-hours per month. No headroom for a second free service. |
| **Data** | FPL public API only for live signals. No Understat, no odds, no injury feed, no lineup leaks. Single upstream, no contract. |
| **Season transitions** | FPL reassigns team and element IDs alphabetically each season. Mixing an archived file with a live one silently attaches the wrong team's fixtures to a player. Guarded in code; treat any change near it as high-risk. |
| **Observability** | None beyond a 6-hourly data-freshness workflow. A 500 or a frontend exception is invisible. |
| **Determinism** | Golden tests pin API responses byte-for-byte. Nothing in a request path may be randomised. |

## Decision-making authority

**Steven is Chairman and the final authority.** He must approve, before the fact:

- Any spending.
- Major product changes.
- Production deployments.
- Any change to prediction methodology.
- Anything that could negatively affect users or the existing application.

The CEO coordinates the executive team and issues Executive Decisions on matters
inside that boundary — sequencing, prioritisation, which executive owns what,
and what is *not* worth doing. A CEO decision is never a substitute for Steven's
approval on the list above; it is the recommendation Steven approves or rejects.

Executives may disagree with each other and with the CEO. Disagreement is recorded
in the meeting minute, not resolved by deletion.

---

## Established facts (from the audit, 3 Sep 2026)

**Health**
- CI green on `main`; 178 backend tests pass.
- Live API serving from Postgres, snapshot 1.9h old, not stale. Site returns HTTP 200.
- GW3 projection frozen `2026-09-03T19:10:40Z`, 626 players, attributed to commit `a96ee3d`.

**Model accuracy**
- 2025/26 walk-forward backtest, 31,117 predictions across GW2–38: Pearson 0.572,
  Spearman 0.704, MAE 0.931, top-20 precision 14.6% — computed over **all** players,
  including those who did not play.
- Live 2026/27, computed over **players who appeared only**: GW1 rank correlation 0.20
  (310 graded), GW2 0.318 (312 graded).
- **These two figures are not comparable, and the flattering one is the one quoted in
  the README.** This is an open credibility problem, not a resolved one.
- Improvement over a last-five-matches baseline: Zeros −19.8%, Blanks −23.6%,
  Tickers −19.7%, **Haulers −0.5%** (OpenFPL −8.4%, FPL Review −7.9%).
- Top predicted decile hauls 30.9% of the time against a 7.9% base rate and contains
  39% of all hauls — but haulers average 7.8 points where the model predicts 2.96.
  The ranking is good; the magnitude is compressed.
- Stated haul probabilities above 30% run hot: a stated 59% delivered 44%.
- Season replay: 145 points across GW1–2 against a field total of 131 → rank
  2,561,918 of 10,366,167. No chips played, so it is a floor. Both weeks reconstructed.

**Growth and measurement**
- `robots.txt` and `sitemap.xml` both return 404.
- Every page shares one title ("xFPL") and one description. No OpenGraph or Twitter
  card tags anywhere.
- **No analytics of any kind.** Not one page view is recorded.
- 21 blog posts exist, hand-authored as Markdown files and committed.
- A Discord invite is linked from the home page and every blog post.

**Deployment (resolved 3 Sep 2026)**
- **The frontend is hosted on Vercel.** Established from the live response headers of
  `xfpl.co.uk`: `server: Vercel`, `x-vercel-id: iad1::...`, `x-powered-by: Next.js`.
  Region `iad1` (US East). This was previously carried as an UNKNOWN because
  `DEPLOYMENT.md` says only "its own host" and the repository holds no `vercel.json` —
  the answer was in the response headers all along.

**Product**
- No user accounts. Identity is an FPL entry ID in `localStorage`. No PII stored
  server-side.
- No email, no notifications, no reminders. Nothing brings a manager back.
- `/squad` gates a fourth tracked rival behind "🔒 Premium lifts the cap". There is
  no Premium, no accounts, and nothing to buy.
- `recommendation_score` — hand-set weights, never backtested — is rendered to users
  as a "Score" to three decimal places, beside a projection that has been backtested.

**Technical debt**
- The README (776 lines) describes four modules that no longer exist
  (`analysis.py`, `team_model.py`, `my_squad.py`, `chip_strategy.py`) and states
  "No dark mode" for an app that is dark by default.
- `docs/FRONTEND_REFACTOR_PLAN.md` says "nothing here is executed yet"; it is fully
  executed.
- `anthropic==0.118.0` is pinned in `backend/requirements.txt` and never imported.
- `API_FOOTBALL_KEY` is plumbed through `render.yaml` and `.env.example` and never read.

---

## Known unknowns

Each of these blocks a real decision. None may be filled in by assumption.

| Unknown | Blocks |
|---|---|
| Current traffic; whether any measurement property already exists (Search Console, host dashboard) | Every growth decision |
| Whether any manager other than Steven has ever used the app, and what they said | Product prioritisation |
| Discord community size and activity | Community strategy |
| Steven's monthly spend ceiling, if any | Infrastructure decisions; any paid tool |
| Whether collecting email addresses is acceptable | The retention loop — the largest product gap |
| Whether monetisation is a goal this season or later | Whether the Premium gate is removed or built behind |
| Steven's own time budget, especially for the near-daily blog cadence | Content strategy |
