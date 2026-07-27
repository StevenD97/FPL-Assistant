# Frontend refactor plan — maintainability & extensibility

_Status: proposal. Nothing here is executed yet. Phases are ordered so each
one ships on its own and leaves `main` green._

## 1. Where we are today

The app works and looks good, but the structure has drifted into a few
patterns that will slow every future feature. Measured on the current tree
(`frontend/src`, ~7,200 LOC):

| Signal | Count | Why it hurts |
| --- | --- | --- |
| `const API_URL = process.env.NEXT_PUBLIC_API_URL \|\| "http://localhost:8000"` redefined | **14 files** | `lib/api.ts` already exports `API_URL`; 14 copies means one env/base-URL change is a 14-file edit. |
| Hand-written domain type declarations | **~52** | `SquadPlayer` lives in both `Dashboard.tsx` and `LoadTeamPanel.tsx`; `TransferPlayer` in both `OptimizePanel.tsx` and `LoadTeamPanel.tsx`. They mirror backend responses by hand → silent drift when the API changes. |
| Raw `fetch()` calls bypassing `fetchJson` | **16** | Inconsistent error handling; the nice FastAPI `{detail}` unwrapping in `fetchJson` only happens sometimes. |
| Client-component pages fetching in `useEffect` | **9 of 16** | No server rendering, no caching, no request dedup, waterfalls, and every page re-implements loading/error state. |
| Files over 400 lines | `BuildSquadPanel` 809, `LoadTeamPanel` 691, `OptimizePanel` 451 | Each mixes fetching + type defs + business logic + presentation. Hard to test, hard to reuse, merge-conflict magnets. |

**What's already good** (keep it):
- `@/` path alias, clean Tailwind v4 `@theme` design tokens.
- `components/ui/*` is a real, consistent primitive kit (Button, Card, Pill, TextField, Skeleton, CountUp…).
- `lib/api.ts`'s `fetchJson` is the right idea — it's just under-used.
- `TeamProvider` is a sound client-state seam.

The core problem isn't the folder names — it's that **feature logic, API contracts, and data-fetching have no home**, so they leak into whatever component needed them first.

## 2. Target architecture

Three layers, each with one job:

```
src/
  app/                 # routing + composition ONLY (thin: fetch on server, render a feature view)
  features/            # a folder per product area — the app's real code lives here
    squad/  players/  matches/  leagues/  home/  blog/  research/
      components/      # feature-scoped UI (BuildSquadPanel, PitchFormation…)
      hooks/           # useSquad(), useOptimizer()… client data hooks
      api.ts           # typed fetchers for this feature (thin wrappers over the api client)
      types.ts         # re-exports the generated types this feature uses
  shared/
    ui/                # the primitive kit (today's components/ui) — design-system only
    layout/            # AppShell, PageContainer, Footer, PageTransition, CommandPalette
    lib/               # api client, formatting, deadline, palette, hooks (useSeasonStatus)
    types/             # generated API types (see §3) + shared hand types
```

Two principles:
1. **Feature-first, not type-first.** Everything for "squad" sits under `features/squad`. Adding a feature = adding a folder, not touching ten shared files.
2. **One direction of dependency.** `app` → `features` → `shared`. Features never import each other; anything two features share moves down to `shared`.

## 3. The single highest-leverage change: a typed API layer

The backend is FastAPI, so it already serves an OpenAPI schema at
`/openapi.json`. We should **generate** the TypeScript types from it instead
of hand-writing ~52 of them.

- Add `openapi-typescript` as a dev dependency; script:
  `"gen:api": "openapi-typescript http://localhost:8000/openapi.json -o src/shared/types/api.d.ts"`.
- One typed client in `shared/lib/api.ts`:
  ```ts
  export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  export async function apiGet<T>(path: string): Promise<T> { /* today's fetchJson, path-based */ }
  ```
  Callers use `apiGet<Squad>("/api/squad/123")` with `Squad` imported from generated types.
- Delete the 14 local `API_URL` consts and the duplicated response types as each feature migrates.

Payoff: when the backend changes a field, `tsc` fails at compile time instead of a user hitting `undefined` at runtime. This is the biggest extensibility win and everything else is easier once it lands.

## 4. Server-first data fetching

Next 16 App Router gives us server components; 9 pages currently opt out with
`"use client"` just to `useEffect`-fetch. Target split:

- **Read-only pages** (players list, player detail, matches, chips, differentials, price-watch, outlook, home): fetch on the **server** in the `page.tsx` (`async` component, `export const dynamic`/`revalidate` as appropriate), pass data into a presentational feature view. Removes client waterfalls, gets caching for free, shrinks the JS bundle.
- **Interactive pages** (squad workspace, leagues compare): stay client, but move their fetching into feature **hooks** (`useSquad`, `useOptimizer`, `usePlanner`) so the panel components are pure. Consider TanStack Query here for dedup/cache/retry — the squad workspace already fires squad + optimizer + planner together and would benefit.

Standardize loading/error: one `<AsyncBoundary>` (Suspense + error) + the existing `Skeleton` primitives, instead of per-page `loading`/`error` booleans.

## 5. Decompose the three giant panels

`BuildSquadPanel` (809), `LoadTeamPanel` (691), `OptimizePanel` (451) each
bundle four concerns. Split every one into:

- `features/squad/api.ts` — the fetchers (`optimizeTransfers`, `getPlanner`, `getAlternatives`…).
- `features/squad/hooks/*` — state orchestration (`useOptimizer`, `usePlanner`, `useSwapPreview`).
- `features/squad/components/*` — small presentational pieces (`SuggestedTransfers`, `PlannerTable`, `SwapPreviewRow`, `SquadPitch`).
- Panel file = thin composition of the above.

`LoadTeamPanel` and `Dashboard` can then share one `SquadView` instead of two copies of `SquadPlayer` + two pitch renderers.

## 6. Kill the duplication (quick wins, do first)

These are safe, mechanical, and immediately shrink the diff surface of every future change:
1. Replace all 14 local `API_URL` with `import { API_URL } from "@/shared/lib/api"` (interim: `@/lib/api`).
2. Route all 16 raw `fetch()` through `apiGet`/`fetchJson`.
3. Dedupe `SquadPlayer`, `TransferPlayer`, `PlayerSummary` into shared types (generated ones once §3 lands).

## 7. Phased rollout (each phase is shippable)

- **Phase 0 — guardrails (½ day).** Add ESLint `no-restricted-syntax` to ban re-declaring `API_URL`, and `import/no-restricted-paths` to enforce the `app → features → shared` direction. Add `gen:api` script. _No moves yet — just the fence so we don't backslide while migrating._
- **Phase 1 — quick wins (§6).** Centralize `API_URL` + `fetchJson`. Pure find-replace, no behavior change.
- **Phase 2 — typed API (§3).** Land generated types; migrate `players` + `matches` (smallest surface) to them as the pattern.
- **Phase 3 — introduce `shared/`.** Move `components/ui`→`shared/ui`, `components/layout`+`nav`→`shared/layout`, `lib`→`shared/lib`. Codemod imports. Mechanical.
- **Phase 4 — carve out `features/`, one at a time.** Order by pain: `squad` first (biggest files, §5), then `players`, `leagues`, `home`, the rest. Server-fetch the read-only ones (§4) as they move.
- **Phase 5 — data-hook polish.** Add TanStack Query to the interactive features; standardize `AsyncBoundary`.

Phases 3–4 are import moves guarded by `tsc` + the Phase-0 lint rules, so risk stays low and we can stop between any two phases.

## 8. What this buys us (extensibility)

- **New page** = new `features/<x>` folder + a thin `app/<x>/page.tsx`. No shared-file surgery.
- **Premium seam** (already stubbed in the squad workspace: `FREE_TRACKED_LIMIT`) gets a real home — a `shared/lib/entitlements.ts` gate that features consult, instead of scattered constants.
- **API changes are compile-time errors**, not production surprises.
- **Panels become testable** — pure components + isolated hooks.
- **Onboarding**: a contributor finds everything for a feature in one folder.

## 9. Explicitly out of scope / deferred

- No visual/UX changes — this is a structural refactor; pixels stay identical.
- State management library: only where it earns its keep (interactive features); read pages stay server-fetched.
- No backend changes (a separate `backend/fpl/*` restructure is already in flight in the working tree — keep the two efforts independent).
