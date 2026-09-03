# Executive Proposal — xFPL Executive HQ

**Proposed by:** CTO (architecture), with CEO commentary on sequencing
**Date:** 3 September 2026
**Status:** AWAITING STEVEN — Phase 1 (architecture) only. Nothing built, nothing changed.

Phase 1 deliverable as requested: sixteen sections, then the decisions that block a start.

---

## 0 — Two findings that change the shape of the answer

Both were established before designing anything, and both matter more than any diagram below.

### 0.1 Claude Pro is not API access

> "The company currently operates using Claude Pro."

Claude Pro is a consumer subscription covering claude.ai and Claude Code. **It does not
include programmatic API access.** A web application that calls Claude on a schedule or
on a button press needs an Anthropic API key on pay-as-you-go billing — a separate
account setup and a separate bill from the Pro subscription.

This is not a blocker, and the cost is far smaller than it sounds (§15). But it is a
decision only Steven can make, and every design below has been shaped so that **HQ is
useful before that decision is taken** and better after it. See §5.

### 0.2 The AI is the cheap part; hosting and attention are not

Measured against current published API pricing (§15): a full five-executive meeting
costs roughly **$0.15–0.40**. Realistic monthly usage is **$2–5**. AI spend is not the
constraint anyone should be designing around.

The real costs are:

| Cost | Reality |
|---|---|
| AI (API) | ~$2–5/month. Trivial. |
| Hosting | **£0 if designed correctly** (§16) — but the existing Render free tier has *no headroom*, so a naive "add a second backend service" costs ~$7/month. The design below avoids it. |
| Steven's attention | **The expensive one.** HQ is roughly 10–12 focused build sessions, and it competes directly with the 30-day xFPL plan for the same scarce resource. |

**CEO note, stated once and then set aside.** The September audit found xFPL's bottleneck
is distribution and measurement, with zero recorded users. An internal management tool
does not move that. HQ is worth building — a company that cannot see itself makes worse
decisions, and this one currently cannot — but it is a bet on the company's *operating
system* while the company still has no measured customers. §14 offers a scope that
resolves this honestly rather than a hedge. The scope call is Steven's; the full
architecture is delivered either way.

---

## 1 — Recommended architecture

### The shape

```
  ┌──────────────────────────────────────────────────────────────┐
  │  HUMAN OWNERS  (Steven · partner)                            │
  └───────────────┬──────────────────────────────────────────────┘
                  │ GitHub OAuth, allowlisted
  ┌───────────────▼──────────────────────────────────────────────┐
  │  HQ WEB APP  — Next.js 16, one deployable                    │
  │  UI · route handlers · auth · reads/writes · fast AI calls    │
  └───────────────┬──────────────────────────────────────────────┘
                  │
  ┌───────────────▼──────────────────────────────────────────────┐
  │  HQ DATABASE  — its own Postgres, separate from xFPL's        │
  │  memory · threads · meetings · decisions · tasks · audit      │
  └───────────────┬───────────────────────────┬──────────────────┘
                  │                           │
  ┌───────────────▼─────────────┐  ┌──────────▼───────────────────┐
  │  HQ WORKER — GitHub Actions │  │  READ-ONLY CONNECTORS        │
  │  long AI jobs: meetings,    │  │  xFPL /api/accuracy, GitHub, │
  │  synthesis, report drafting │  │  analytics — all optional    │
  └─────────────────────────────┘  └──────────────────────────────┘

  xFPL application: UNTOUCHED. Separate repo folder, separate deploy,
  separate database, separate domain. HQ reads from it; never writes to it.
```

### Three decisions inside that picture

**One repository, separate deployables.** HQ lives at `hq/` beside `backend/` and
`frontend/`. Not a second repository, for one decisive reason: the CTO executive's core
job is analysing the xFPL codebase, and same-repo means it reads files rather than
cloning with credentials. Isolation comes from separate deploys and separate databases,
which is where isolation actually belongs.

**No second always-on backend.** The web app's route handlers hold the API. This avoids
a second Render service — there is no free-tier headroom left (~730 of 750 monthly
instance-hours are already spent on the keep-alive ping), so a second service is a real
$7/month, and it buys nothing HQ needs.

**Long AI jobs run on GitHub Actions, not in a request.** A five-executive meeting is
five sequential model calls — one to three minutes. That exceeds serverless function
limits and is a bad fit for a request anyway. Dispatching a workflow is free, the team
already runs five workflows, and Actions allows six hours. The meeting is created
synchronously, dispatched, and the page watches the row until it completes.

---

## 2 — Technology stack

Chosen to add as close to zero new technology as possible.

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 16 App Router, React 19, TypeScript, Tailwind v4** | Identical to xFPL's frontend. The design tokens in `globals.css` and the 33-component UI kit in `shared/ui/` are directly reusable. |
| HQ backend | **Next.js route handlers + server actions** | No second service, no second language for HQ. Secrets stay server-side. |
| Database | **PostgreSQL** — its own instance | Same technology as xFPL, same provider (Neon free tier). See §3 for why it must not be the same database. |
| DB access | **Drizzle ORM + drizzle-kit migrations** | TypeScript-native, lightweight, generates SQL migrations. |
| Worker | **Python, run by GitHub Actions** | Reuses the team's existing Actions patterns and the `anthropic` Python SDK. |
| AI | **Anthropic Messages API** via the official SDK, with prompt caching | §5. |
| Auth | **GitHub OAuth** + server-side sessions | §4. |
| Deploy | Same host as the xFPL frontend, separate project | §16. |

**On sharing frontend components.** Copy the 6–10 components HQ needs (Button, Card,
Table, Tabs, Alert, Pill, TextField, Select, Skeleton) plus the token file. Do **not**
extract a shared package: that couples two deploy cycles and forces a change to xFPL's
build to serve HQ, which is exactly the disruption this project is required to avoid.
Copying is the cheaper and safer call at this size.

---

## 3 — Database design

### Separate database — and a specific reason

xFPL's `backend/alembic/env.py` sets `target_metadata = Base.metadata` over xFPL's models
only. If HQ's tables lived in the same database, the next
`alembic revision --autogenerate` on xFPL would propose **dropping every HQ table**. That
is a silent, destructive failure mode one command away.

It can be worked around (a separate Postgres schema plus an `include_object` filter and
`version_table_schema`), but a separate database is simpler, free on Neon, and gives the
isolation the brief demands. **Recommendation: separate database.**

### Schema

```
IDENTITY & ACCESS
  users              id · github_id · github_login · display_name · email
                     · role(owner|member) · active · created_at
  sessions           id · user_id · expires_at · created_at · revoked_at

EXECUTIVES & MEMORY
  executives         id · key(ceo|cto|cpo|analytics|cmo) · title · mandate_path
                     · model · effort · active
  memory_documents   id · path · title · kind(context|principle|mandate|report
                     |decision|meeting|note) · body_md · tags[] · source(repo|hq)
                     · checksum · updated_at
                     -- the company memory; §12

CONVERSATION
  threads            id · executive_id · title · created_by · created_at
  messages           id · thread_id · role(human|executive) · author_user_id
                     · content_md · ai_run_id · created_at

MEETINGS
  meetings           id · title · question · context_md · priority
                     · status(draft|running|synthesising|complete|failed)
                     · created_by · created_at · completed_at
  meeting_positions  id · meeting_id · executive_id · position_md · recommendation
                     · impact · cost · effort · risk · confidence
                     · status · ai_run_id · completed_at
  meeting_synthesis  meeting_id · recommendation_md · reasoning_md · risks_md
                     · alternatives_md · proposed_action_md · dissent_md · ai_run_id

DECISIONS
  decisions          id · ref(ED-001) · question · context_md
                     · status(awaiting_analysis|awaiting_human|approved|rejected
                       |in_progress|completed|revisited)
                     · owner_executive_id · meeting_id · risk_tier
                     · decided_by · decided_at · human_rationale · outcome_md
                     · review_at · created_at
  decision_links     decision_id · kind(meeting|report|task) · target_id

TASKS
  tasks              id · title · description_md · executive_owner_id
                     · human_owner_id · priority
                     · status(proposed|approved|in_progress|blocked|review|completed)
                     · due_date · decision_id · meeting_id · expected_outcome
                     · risk_tier · created_at · updated_at

REPORTS
  reports            id · executive_id · title · kind · body_md · confidence
                     · source_refs(jsonb) · ai_run_id · created_at

GOVERNANCE
  approvals          id · subject_type · subject_id · risk_tier · requested_at
                     · decided_by · decided_at · decision(approve|reject|more|defer)
                     · comment
  audit_log          id · actor_type(human|ai|system) · actor_id · action
                     · subject_type · subject_id · payload(jsonb) · created_at

OPERATIONS
  ai_runs            id · kind · subject_id · model · effort · input_tokens
                     · cache_read_tokens · cache_write_tokens · output_tokens
                     · cost_micros · latency_ms · status · error · created_at
                     -- every model call, costed; §15
  integrations       id · kind · status(not_connected|connected|error)
                     · config(jsonb, no secrets) · last_sync_at · last_error
  metrics            id · source · key · value · unit · captured_at
                     -- sparse by design; no rows = "Not connected"; §8
```

Two properties worth naming. **`ai_runs` makes AI cost a first-class, visible number**
rather than a surprise on a card statement — the settings page can show spend to date
and this month. And **`metrics` is sparse on purpose**: the dashboard renders
"Not connected" from the absence of rows, so it is structurally incapable of inventing
a figure.

---

## 4 — Authentication design

**GitHub OAuth, allowlisted by GitHub user ID.**

Why, over the alternatives: both owners already have GitHub accounts (the repository is
there), it costs nothing, there are no passwords to store or leak, and it is the same
identity the future GitHub integration will need. Email magic links need a paid sender;
a managed auth vendor adds a dependency and a bill for two users; rolling our own
password auth for an internal tool would be the worst option available.

```
Login  → GitHub OAuth (scope: read:user only)
       → callback verifies state, exchanges code server-side
       → github_id checked against HQ_ALLOWED_GITHUB_IDS
       → row upserted into users
       → server-side session row; HttpOnly + Secure + SameSite=Lax cookie
       → 30-day sliding expiry, revocable by deleting the row
```

- **Authorisation** is a single `role` today (`owner`). The `users.role` column and a
  middleware check exist from day one so a future `member` role (read + comment, no
  approve) is a column value, not a refactor.
- **Every human action writes `audit_log`** with `user_id`, action, subject and
  timestamp. Approvals additionally record the optional comment. This satisfies the
  brief's requirement that every decision records who, when, what and why.
- **The allowlist is an environment variable**, so adding a third person is a config
  change and a deploy, with no code edit.

---

## 5 — AI integration design

### One function, called from two places

Everything routes through a single `runExecutive()` call. There are no agents, no
background loops, and no executives talking to each other unprompted.

```
runExecutive({ executive, question, context_pack, output_schema })
   → Messages API, one call
   → structured output (typed object, not free prose)
   → persist to reports / messages / meeting_positions
   → persist token counts + cost to ai_runs
```

A **meeting** is that function called N times independently, then once more for the CEO
synthesis with the N positions as input. Executives never see each other's answers
before writing their own — which is what makes the disagreement real rather than
performed.

### Cost control, built into the request shape

| Lever | How |
|---|---|
| **Prompt caching** | The context pack is ordered stable-first: principles → executive mandate → company context → retrieved documents → the question last. A `cache_control` breakpoint after the stable prefix. Cache reads cost ~0.1× base input, so a 10k-token company prefix costs about a fifth of a cent per call on Sonnet 5. |
| **Model per role** | Not every seat needs the same model. Proposed default: **Opus 5** for the CEO synthesis and the Head of FPL Analytics (the two jobs where reasoning quality is the product), **Sonnet 5** for CTO/CPO/CMO positions and single questions. Overridable per executive in the `executives` table — a config change, not a code change. |
| **Retrieval, not the whole corpus** | §12. Typically 8–14k tokens of context, not 40k. |
| **No idle spend** | Nothing runs unless a human presses something. No polling, no scheduled analysis, no keep-alive. |
| **Visible spend** | Every call writes `ai_runs`. A monthly cap in settings that refuses new runs past a threshold is ~20 lines and should be in Phase 1. |

### The three tiers, and which to build

| Tier | What | API cost | Build |
|---|---|---|---|
| **0 — today** | HQ is the system of record; the AI work happens in Claude Code sessions that read and write HQ's database | **£0** | Ships with Phase A |
| **1 — recommended** | HQ calls the Messages API directly. Conversations, meetings, synthesis, reports | ~$2–5/mo | Phase B |
| **2 — later** | Executives get read-only tools: repo search for the CTO, a SQL view over xFPL's data for Analytics | Slightly higher | Not now |

**Tier 0 is why the API-key decision does not block a start.** HQ is genuinely useful as
the record, the workflow and the approval surface before a single API call is made — and
the seam to Tier 1 is one function.

---

## 6 — Executive-agent architecture

An "executive" is **not a process**. It is a row plus a document:

```
executives row      identity, model, effort, active
mandate document    company/executives/<ROLE>.md — the persistent role definition
context pack        assembled per question (§12)
output schema       a typed structure the model must fill
```

The mandate documents **already exist** and are already written to the right standard —
the CTO's ANALYSE→PLAN→APPROVAL→IMPLEMENT→TEST→REPORT process, the Head of FPL
Analytics' four-way evidence classification and veto over accuracy claims, the CPO's
mandate to refuse work. HQ imports them into `memory_documents` rather than restating
them, so the repository stays the source of truth and one edit updates both.

Structured output per executive, so a position is data rather than an essay:

```
{ recommendation, reasoning_md, evidence[{claim, label, source}],
  impact, cost, effort, risk, confidence, proposed_tasks[], decisions_required[] }
```

`label` is the four-way classification: VERIFIED · EVIDENCE-SUPPORTED · UNTESTED
ASSUMPTION · SPECULATION. Making it a required field means an executive **cannot** return
an unlabelled claim — the standard is enforced by the schema, not by hoping the model
remembers.

`proposed_tasks` and `decisions_required` are drafts. They land as `status: proposed`
and nothing acts on them.

---

## 7 — Permission model

The architectural principle, from which everything else follows:

> **AI writes rows. Humans change states. A separate authenticated path executes.**

An executive's only capability is returning structured JSON that gets stored. It has no
write tools, no deploy access, no shell, and no credentials. There is no code path from
a model response to an action.

| Tier | Actions | Mechanism |
|---|---|---|
| **Automatic** | Analyse · research · produce reports · recommend · draft tasks · read existing data · read code | Executive returns JSON; HQ stores it. No gate. |
| **Human approval required** | Implement significant code changes · change product functionality · launch marketing · change prediction methodology · modify production | `risk_tier = needs_approval`. Row is created but frozen at `proposed`. UI shows an amber **Approval required** banner. Cannot advance without an `approvals` row. |
| **Human approval absolutely required** | Spend money · pricing · production deployment · destructive database operations · deleting company data · major strategy | `risk_tier = critical`. Red banner, explicit typed confirmation, both the approver and a reason recorded. |

Two properties the brief specifically asks for:

- **AI cannot silently convert a recommendation into production work.** Structurally
  impossible: HQ has no deployment credentials and no write access to xFPL. Approving a
  task in HQ marks it approved — the work still happens in a Claude Code session with a
  human present. HQ records the authorisation; it never performs it.
- **Approval requirements are visible before the fact.** The risk tier is computed when
  the task or decision is created and rendered on the card, not discovered at the end.

---

## 8 — Dashboard information architecture

Navigation as proposed in the brief, with one change: **Company** and **Reports** overlap,
so Reports lives inside each executive workspace plus one global list, and Company holds
the memory (mission, context, principles, objectives).

```
Dashboard · Executives · Meetings · Decisions · Tasks · Reports · Company · Settings
```

### Dashboard — company overview

Honest from day one. Of the eight tiles the brief asks for, **three have real data**:

| Tile | Day-one state | Source |
|---|---|---|
| Users | **Not connected** | needs analytics (xFPL 30-day plan, item 2) |
| Traffic | **Not connected** | same |
| User growth | **Not connected** | same |
| Revenue | **Not connected** | no monetisation exists |
| Prediction accuracy | **Live** | xFPL `/api/accuracy` — read-only |
| Active tasks | **Live** | HQ database |
| Pending decisions | **Live** | HQ database |
| Critical issues | **Live** | HQ: overdue approvals, failed runs, blocked tasks |

"Not connected" is rendered from the absence of `metrics` rows and links to what would
connect it. The dashboard cannot display a number nobody measured.

### Executive cards

Five cards: name · role · current priority (their most recent open objective) · status
(idle / running / awaiting approval) · last report with date · active task count ·
pending decision count. Click opens the workspace.

### Executive workspace

Overview · Objectives · Tasks · Reports · Decisions · Meeting participation ·
**Conversation**. The conversation is a thread: ask a question, the executive answers
from its mandate plus a retrieved context pack, and the answer is stored. Threads are
memory — a later question can reference an earlier answer.

---

## 9 — Meeting workflow

```
1  CREATE      title · question · executives invited · priority · context
               → meetings row, status=draft
2  DISPATCH    "Hold the meeting" → status=running, GitHub Actions workflow dispatched
3  POSITIONS   worker calls runExecutive() once per invited executive, INDEPENDENTLY
               → meeting_positions rows appear as each completes; the page watches
4  SYNTHESIS   status=synthesising; CEO receives all positions
               → recommendation · reasoning · risks · alternatives · dissent
                 · proposed action
5  REVIEW      status=complete. Humans read positions side by side, then the synthesis
6  DECIDE      "Create decision from this meeting" → a decisions row, linked,
               status=awaiting_human
```

Three rules carried from the existing meeting protocol, now enforced by the software:

- **Independence.** An executive never sees another's position before writing its own.
- **Dissent is a field, not a footnote.** `meeting_synthesis.dissent_md` is required —
  the CEO must record positions not taken and what would reopen them.
- **A meeting implements nothing.** It produces rows in `meeting_positions`,
  `meeting_synthesis`, and optionally a `decisions` row at `awaiting_human`. There is no
  path from a meeting to an action.

Suggested guardrail: invite fewer than all five by default, with the count shown next to
the estimated cost before dispatch, so seating everyone is a visible choice.

---

## 10 — Decision workflow

```
awaiting_analysis ──► awaiting_human ──► approved ──► in_progress ──► completed
                            │                                              │
                            ├──► rejected                                  │
                            ├──► (request more analysis) ──► awaiting_analysis
                            ├──► deferred ─────────────────────────────────┤
                            └────────────────────── revisited ◄────────────┘
```

Four human actions, exactly as the brief specifies: **Approve · Reject · Request more
analysis · Defer.**

Each records `decided_by`, `decided_at`, the action, and an optional reason — into both
the decision row and `audit_log`. "Request more analysis" reopens the decision and can
dispatch a follow-up question to the owning executive.

A decision carries: ref (`ED-001`), question, context, every executive recommendation,
the CEO synthesis, the human decision with its author and reasoning, owner, status,
dates, linked reports, and — the field most systems omit — **`outcome_md`**, filled in
later. Without it there is no way to learn whether the decisions were any good, and a
decision log nobody scores is a filing cabinet.

`review_at` supports the "revisited" status: a decision can schedule its own re-read.

---

## 11 — Task workflow

```
proposed ──► approved ──► in_progress ──► review ──► completed
    │                          │
    └──► rejected              └──► blocked ──► in_progress
```

Tasks carry everything the brief lists — title, description, executive owner, human
owner, priority, status, due date, related decision, related meeting, expected outcome —
plus `risk_tier`, which drives the approval gate.

**Executives may only create tasks at `proposed`.** Only a human moves a task to
`approved`, and for `needs_approval` or `critical` tiers that transition writes an
`approvals` row. Completing a task prompts for a one-line actual outcome, which feeds
back to the linked decision's `outcome_md`.

---

## 12 — Company-memory architecture

### The recommendation: no vector database

The entire `company/` corpus plus the audit is roughly **30–40k tokens**. A stable
context prefix of ~10k tokens costs about **$0.002 per cached call** on Sonnet 5.
Embeddings, a vector store and a retrieval pipeline would save a fraction of a cent per
call and cost weeks of build time and a permanent new dependency. **Do not build RAG for
this.** Revisit if the corpus passes roughly 200k tokens — years away at this rate.

### What to build instead: a layered context pack

```
LAYER 1 — always, cached  (~9k tokens, identical across every call)
  operating principles · the executive's own mandate · company context

  ── cache_control breakpoint ──

LAYER 2 — retrieved by SQL, not embeddings  (~2–5k)
  · the 5 most recent decisions
  · reports by this executive, most recent first
  · documents whose tags intersect the question's tags
  · the current thread's recent turns
  each capped, each with a token budget, each cited by id

LAYER 3 — the question  (~0.2k)
```

Retrieval is `tags && $1 ORDER BY updated_at DESC LIMIT n` — boring, debuggable, and
adequate. Every included document is listed in the response's `source_refs`, so an
answer can always be traced to what it read.

### Keeping memory and repository in step

`memory_documents` carries `source` and `checksum`. A small sync job imports
`company/*.md` and `docs/*.md` on change; documents authored in HQ (reports, meeting
minutes, decisions) carry `source=hq` and can be exported back to `company/` as files, so
the repository stays the durable record and neither side silently drifts.

---

## 13 — Security architecture

| Concern | Design |
|---|---|
| **Authentication** | GitHub OAuth, allowlisted by user ID. Server-side sessions, HttpOnly + Secure + SameSite cookies, revocable. |
| **Authorisation** | Role on the user row, checked in middleware. Every mutating route re-checks; no client-side-only gating. |
| **Secrets** | `ANTHROPIC_API_KEY`, `DATABASE_URL`, GitHub OAuth secret and the worker PAT live in host environment variables and Actions secrets. **Never in `NEXT_PUBLIC_*`.** No model call is ever made from the browser. |
| **API security** | All mutations are POST with CSRF protection; rate limit per user; every AI-triggering route is gated on the spend cap. |
| **Prompt injection** | The real risk, and it grows with every future integration. Four defences: (1) executives have **no write tools and no credentials** — the worst outcome of a successful injection is a bad recommendation a human then reads; (2) untrusted content — repo files, FPL data, GitHub issues, feedback — is wrapped in explicit delimiters and labelled as data, never instructions; (3) **structured output** means a response is a typed object, so injected prose cannot become an action; (4) approval gates live in application code and are never a model judgement. |
| **Separation of recommendation and execution** | HQ holds no deployment credentials, no write access to xFPL's database, and no shell. This is enforced by what HQ *has*, not by what it is told. |
| **Company data protection** | HQ is not public. Private repository, allowlisted auth, no public routes beyond the login page. |
| **Audit logging** | Every human action and every AI run is a row. `ai_runs` additionally records model, tokens and cost, so "what did the AI do and what did it cost" is always answerable. |
| **xFPL isolation** | Separate database, separate deployment, read-only HTTP access to public endpoints only. HQ cannot break xFPL because it has no means to write to it. |

---

## 14 — Estimated development effort

Honest units: a "session" is a focused Claude Code working session. On Claude Pro,
expect roughly one to two per day at this intensity.

| Phase | Scope | Sessions |
|---|---|---|
| **A — Skeleton** | Next.js app, GitHub OAuth, schema + migrations, memory import, shell + navigation, dashboard reading real data with honest "Not connected" tiles | 3–4 |
| **B — Executives** | Five workspaces, conversation threads, `runExecutive()`, context packs, prompt caching, `ai_runs` cost tracking + spend cap | 3–4 |
| **C — Meetings** | Creation, Actions worker, independent positions, CEO synthesis, side-by-side review | 2–3 |
| **D — Governance** | Decisions, tasks, approvals, risk tiers, audit log | 2–3 |
| **E — Connectors** | xFPL accuracy feed, analytics when it exists, integration seams | 1–2 |
| | **Total** | **11–16 sessions** |

### The CEO's scope recommendation

**Build A + B. Stop. Use it for two weeks. Then decide on C, D and E.**

A + B is 6–8 sessions and delivers the thing that is actually missing: one place where
the company's context lives, both owners can see it, and either can ask an executive a
question and keep the answer. Meetings, tasks and decisions can run on the existing
`company/` documents in the meantime — they work today.

C, D and E build workflow machinery for a volume of decisions the company does not yet
have. Two owners and roughly one decision a week do not need a task state machine; they
need the answers to be findable. Build the machinery when the volume justifies it, and
let two weeks of real use say what it should look like — which is exactly the argument
the CMO won for xFPL itself.

---

## 15 — Estimated ongoing costs

### AI, at current published API pricing

| Model | Input /MTok | Output /MTok | Cache read /MTok |
|---|---|---|---|
| Claude Opus 5 | $5.00 | $25.00 | ~$0.50 |
| Claude Sonnet 5 | $2.00 | $10.00 | ~$0.20 |
| Claude Haiku 4.5 | $1.00 | $5.00 | ~$0.10 |

Cache writes cost 1.25× base input on the default 5-minute TTL.

Assuming a ~10k-token cached company prefix, ~3k of retrieved context and ~1.2k output:

| Operation | Sonnet 5 | Opus 5 |
|---|---|---|
| One executive question (cache hit) | ~$0.02 | ~$0.05 |
| Five-executive meeting + CEO synthesis | ~$0.15 | ~$0.38 |
| A generated report | ~$0.04 | ~$0.10 |

**Realistic month** — 30 questions, 4 meetings, 8 reports:

| Configuration | Monthly |
|---|---|
| All Sonnet 5 | **~$1.50** |
| Mixed (Opus for CEO + Analytics, Sonnet elsewhere) — **recommended** | **~$3** |
| All Opus 5 | **~$4** |

Even ten times this usage is under $40/month. The `ai_runs` table plus a configurable cap
makes a surprise structurally impossible.

### Infrastructure

| Item | Cost |
|---|---|
| HQ web app (same host as xFPL frontend, separate project) | **£0** on a hobby tier |
| HQ database (Neon free tier, separate database) | **£0** |
| HQ worker (GitHub Actions) | **£0** — well inside free minutes |
| **Total infrastructure** | **£0** |
| **Total, including AI** | **~$3–5/month** |

The one way this stops being free is putting HQ's backend on a second Render service —
about $7/month for something the design above does not need.

---

## 16 — Recommended deployment architecture

```
xfpl.co.uk            xFPL frontend      (unchanged)
  └── api             xFPL backend       Render free   (unchanged)
        └── Postgres  xFPL database      Neon          (unchanged)

hq.xfpl.co.uk         HQ web app         same host as xFPL frontend, new project
        └── Postgres  HQ database        Neon, separate database
GitHub Actions        HQ worker          hq-run-meeting.yml, workflow_dispatch
```

- **Separate project, separate domain, separate database.** Nothing in xFPL's deployment
  changes — no shared build, no shared environment, no shared migrations.
- **A third CI job** in the existing `ci.yml` for HQ's typecheck, lint and build. xFPL's
  two jobs are untouched.
- **`hq.xfpl.co.uk` needs one DNS record.** A subdomain also keeps cookies and CORS
  boundaries clean.
- **Rollback is deleting a deployment.** Because nothing is shared, HQ failing has no
  path to affecting xFPL.

**One blocking unknown:** the frontend host is still unrecorded — `DEPLOYMENT.md` says
only "its own host". This is item 7 on the owners' desk and it determines the HQ web app
deployment, the DNS step and whether the hobby tier genuinely covers a second project.

---

## Decisions required before anything is built

Nothing starts without 1 and 2. The rest shape the build.

| # | Decision | Why it blocks | Who |
|---|---|---|---|
| **1** | **Set up Anthropic API billing?** Claude Pro does not cover programmatic access. Roughly $3–5/month at the usage above. Answering **no** is viable — HQ still ships at Tier 0 as the system of record, and the AI work continues in Claude Code sessions. | Determines whether HQ ships at Tier 0 or Tier 1 | Steven |
| **2** | **Scope: A+B, or the full A–E?** The CEO recommends A+B (6–8 sessions), then two weeks of real use before committing to the rest. | Determines the build plan | Both owners |
| **3** | **Where is the xFPL frontend hosted?** Still UNKNOWN. Determines HQ's deployment. | Blocks Phase A deployment | Steven |
| **4** | **Sequencing against the xFPL 30-day plan.** Both need the same scarce attention. Options: HQ first, xFPL plan first, or interleave. The CEO's standing recommendation is that the xFPL discoverability work goes first, because it has a deadline the football calendar sets and HQ does not. | Determines what happens this month | Both owners |
| **5** | **Confirm `hq.xfpl.co.uk`**, or another domain. | One DNS record in Phase A | Steven |
| **6** | **Model per executive.** Recommended: Opus 5 for CEO synthesis and Analytics, Sonnet 5 elsewhere. Changeable later without a rebuild. | Cost and quality; a config value | Steven |
| **7** | **Monthly AI spend cap** to enforce in software. Suggested: $25 — roughly five times expected usage, low enough to catch a runaway. | A settings value | Steven |

---

**Nothing has been built. No xFPL code, configuration, infrastructure or model behaviour
has been touched by this proposal.**

---

# ADDENDUM — the free operating routes (4 September 2026)

**This corrects an omission in §5 above.** The proposal presented Tier 0 as "the AI work
happens in Claude Code sessions", which is true but incomplete. There is a route where
the executives answer **inside a web page, on a phone, with no terminal and no Anthropic
API key** — and it changes which option is recommended first.

## What was missed: a published Artifact can call Claude itself

An Artifact page can declare a `sample` capability. The page then calls Claude directly,
**billed to the Claude subscription of whoever is viewing the page** — not to an API key,
and not to a separate Anthropic bill. Structured JSON output is supported, which is
exactly the shape an executive position needs.

Combined with the `db` capability the owners' desk already uses for persistence, a single
Artifact can be a genuinely working Executive HQ: company memory, executive conversations,
meetings with independent positions, CEO synthesis, decisions and approvals — for **£0 in
new spend**.

## The four routes, honestly costed

| Route | Where it runs | New money | What it spends instead |
|---|---|---|---|
| **F0 — today, used externally** | Claude Code on the web or phone (`claude.ai/code`) + the owners' desk | **£0** | Claude Pro usage |
| **F1 — the desk becomes the HQ** | One Artifact with `db` + `sample` | **£0** | The *viewer's* Claude usage, per question |
| **F2 — scheduled** | A Routine fires a Claude Code session on a schedule; it commits its output to the repo | **£0** | Claude Pro usage |
| **P1 — the built app** | The Next.js app in this proposal | ~$3–5/mo | An Anthropic API key |

## What F1 genuinely cannot do

Stated plainly, because "free" is not the same as "unconstrained":

- **It spends Pro usage, not money.** A five-executive meeting is five calls against the
  viewer's own Claude allowance — the same allowance the development sessions draw on.
  The scarce resource does not change, it just stops being a separate bill.
- **The partner needs their own Claude account.** Sharing one is not an option. On a free
  plan their allowance will be small; whether the shared-page access works across two
  personal accounts needs testing, not assuming.
- **Model choice is coarse.** A tier (quick / default / complex), not a specific model per
  executive.
- **Memory lives in the page's own store, not the repository.** The company context has to
  be seeded into it and kept in step deliberately, rather than read from `company/` on each
  call.
- **No custom auth or audit beyond what the platform gives.** Access is claude.ai identity
  and org sharing; the audit trail is what the page records for itself.
- **No repository access.** The CTO executive cannot read xFPL's code from inside a page.
  Code analysis stays in a Claude Code session.

## Revised recommendation

**Do F1 before P1.** Extend the existing owners' desk into a working HQ — memory,
executive conversations, meetings, synthesis, decisions — at £0. Use it for a month. If
it turns out the constraints above genuinely bite (usage limits, model choice, the CTO
needing repo access, a real audit trail), P1 is the upgrade, and the schema and workflows
in this proposal are what it upgrades *to* — none of that design is wasted.

This also resolves decision #4 in the table above: F1 does not compete with the xFPL
30-day plan for build sessions the way a full application does.

**Decision #1 changes accordingly.** Setting up API billing is no longer a
start-blocker — it becomes a later question, asked only if F1's limits are reached.
