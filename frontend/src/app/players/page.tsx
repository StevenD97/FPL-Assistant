"use client";

import { useEffect, useMemo, useState } from "react";
import { TextField } from "@/shared/ui/TextField";
import { Pill } from "@/shared/ui/Pill";
import { Pagination } from "@/shared/ui/Pagination";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { PlayerListCard, PlayerListCardSkeleton } from "@/features/players/PlayerListCard";
import type { PlayerListItem } from "@/shared/types/api";
import { useShortlist } from "@/shared/lib/shortlist";
import { loadSquadDraft } from "@/shared/lib/draft";
import { OWNERSHIP_BANDS, type OwnershipKey } from "@/shared/lib/ownership";
import { apiGet } from "@/shared/lib/api";

const POSITIONS = ["All", "GKP", "DEF", "MID", "FWD"] as const;
const PAGE_SIZE = 24;

type SortKey = "predicted_points" | "value" | "selected_by_percent" | "season_points" | "cost";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "predicted_points", label: "xPts · 5GW" },
  { key: "value", label: "Value" },
  { key: "selected_by_percent", label: "Owned" },
  { key: "season_points", label: "Season pts" },
  { key: "cost", label: "Price" },
];

// Shared with My Squad's Differentials read, so "< 10%" is one definition rather
// than two - see shared/lib/ownership.ts.
const OWNERSHIP = OWNERSHIP_BANDS;

// The three research surfaces that used to be separate pages, now expressed as
// lenses over the one player list. In this app xPts *is* the multi-GW outlook,
// so "All players" and "Outlook" share the projection ranking - the Outlook
// lens exists so people who lived on that page still find it. "Differentials"
// just caps ownership. Selecting a lens presets the sort + ownership below.
type LensKey = "all" | "outlook" | "differentials";

const LENSES: { key: LensKey; label: string; sort: SortKey; ownership: OwnershipKey; blurb: string }[] = [
  {
    key: "all",
    label: "All players",
    sort: "predicted_points",
    ownership: "any",
    blurb: "Every player, ranked by projected points. Sort or filter to dig in.",
  },
  {
    key: "outlook",
    label: "Outlook",
    sort: "predicted_points",
    ownership: "any",
    blurb: "The 5-gameweek projection - each card's fixture ticker shows the run behind the number.",
  },
  {
    key: "differentials",
    label: "Differentials",
    sort: "predicted_points",
    ownership: "lt10",
    blurb: "Low-owned punts (under 10%) with the best projected points.",
  },
];

const GRID_CLASS = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

// Which lens matches the current sort+ownership. Several lenses can share a
// preset (All / Outlook), so keep the current pick if it still fits; otherwise
// fall back to the first match, or null when the combo matches no lens.
function lensFor(sort: SortKey, ownership: OwnershipKey, current: LensKey | null): LensKey | null {
  const matches = LENSES.filter((l) => l.sort === sort && l.ownership === ownership);
  if (matches.length === 0) return null;
  if (current && matches.some((m) => m.key === current)) return current;
  return matches[0].key;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("All");
  const [sortKey, setSortKey] = useState<SortKey>("predicted_points");
  const [ownership, setOwnership] = useState<OwnershipKey>("any");
  const [lens, setLens] = useState<LensKey | null>("all");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shortlistOnly, setShortlistOnly] = useState(false);

  const shortlist = useShortlist();
  const shortlistSet = useMemo(() => new Set(shortlist), [shortlist]);
  // Players already in the saved squad draft, so the list can flag them. Read
  // once on mount - the draft lives on another page.
  const draftSet = useMemo(() => new Set(loadSquadDraft().ids), []);

  // Deep-link from the Home shortlist teaser (/players?view=shortlist).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "shortlist") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShortlistOnly(true);
    }
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        setPlayers(await apiGet<PlayerListItem[]>("/api/players"));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Lens = shortcut that presets sort + ownership. Manual sort/ownership tweaks
  // re-derive which lens (if any) still fits. Every path resets to page 1 so a
  // stale page number can't leave the grid blank.
  function applyLens(key: LensKey) {
    const l = LENSES.find((x) => x.key === key)!;
    setLens(key);
    setSortKey(l.sort);
    setOwnership(l.ownership);
    setPage(1);
  }
  function changeSort(key: SortKey) {
    setSortKey(key);
    setLens(lensFor(key, ownership, lens));
    setPage(1);
  }
  function changeOwnership(key: OwnershipKey) {
    setOwnership(key);
    setLens(lensFor(sortKey, key, lens));
    setPage(1);
  }

  function sortValue(p: PlayerListItem, key: SortKey): number {
    if (key === "season_points") return p.season_stats?.total_points ?? -1;
    return p[key];
  }

  const ownershipMax = OWNERSHIP.find((o) => o.key === ownership)?.max ?? null;

  const rows = useMemo(() => {
    if (!players) return [];
    let pool = players;
    if (shortlistOnly) pool = pool.filter((p) => shortlistSet.has(p.id));
    if (position !== "All") pool = pool.filter((p) => p.position === position);
    if (ownershipMax != null) pool = pool.filter((p) => p.selected_by_percent <= ownershipMax);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      pool = pool.filter((p) => p.web_name.toLowerCase().includes(q) || p.team_short.toLowerCase().includes(q));
    }
    return [...pool].sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey));
  }, [players, shortlistOnly, shortlistSet, position, ownershipMax, search, sortKey]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  // Position isn't counted: it has its own always-visible row, so a badge for
  // it would be a count of something already on screen.
  const activeFilterCount = ownership !== "any" ? 1 : 0;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Players · Outlook · Differentials"
        title="Players"
        subtitle="Every player in the live 2026/27 game, in one place - project the next five gameweeks, hunt differentials, then sort and filter to your shortlist."
        action={players ? <span className="font-mono text-sm text-text-muted">{rows.length} players</span> : undefined}
      />

      {/* One tidy toolbar - sticks under the header while you scroll the list.
          View = the merged lenses; Filters holds ownership.

          Position is not in that popover any more. With 626 players and a list
          that runs for pages, narrowing to one position is the first thing
          almost everyone does, and it was two taps behind a button labelled
          "Filters". It now has its own always-visible row. */}
      <div className="sticky top-[56px] z-10 -mx-4 border-b border-border bg-surface-sunken/95 px-4 py-2.5 backdrop-blur lg:top-0 lg:-mx-6 lg:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <TextField
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name or team..."
            wrapperClassName="min-w-[180px] flex-1"
          />

          {/* View segmented - lens tooltip carries the blurb */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-white p-0.5">
            {LENSES.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => applyLens(l.key)}
                title={l.blurb}
                className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                  lens === l.key ? "bg-pl-purple text-white" : "text-text-secondary hover:text-pl-purple"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* Filters popover - position + ownership */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                activeFilterCount > 0
                  ? "border-pl-purple text-pl-purple"
                  : "border-border bg-white text-text-secondary hover:border-pl-purple/40"
              }`}
            >
              Filters
              {activeFilterCount > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-pl-purple px-1 text-[11px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {filtersOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setFiltersOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-border bg-white p-3 shadow-lg">
                  <div>
                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      Owned
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {OWNERSHIP.map((o) => (
                        <Pill key={o.key} active={ownership === o.key} onClick={() => changeOwnership(o.key)}>
                          {o.label}
                        </Pill>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Shortlist toggle - your personal watchlist */}
          <button
            type="button"
            onClick={() => {
              setShortlistOnly((v) => !v);
              setPage(1);
            }}
            aria-pressed={shortlistOnly}
            title="Show only your shortlisted players"
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              shortlistOnly
                ? "border-pl-yellow bg-pl-yellow/15 text-text-primary"
                : "border-border bg-white text-text-secondary hover:border-pl-purple/40"
            }`}
          >
            <span className={shortlistOnly ? "text-pl-yellow" : "text-slate-300"} aria-hidden="true">
              ★
            </span>
            Shortlist
            {shortlist.length > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-pl-purple px-1 text-[11px] font-bold text-white">
                {shortlist.length}
              </span>
            )}
          </button>

          {/* Sort */}
          <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Sort
            <select
              value={sortKey}
              onChange={(e) => changeSort(e.target.value as SortKey)}
              className="rounded-lg border border-border bg-white px-2.5 py-2 text-sm font-medium normal-case tracking-normal text-text-primary outline-none focus:border-pl-cyan focus:shadow-focus"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Position, always one tap away. Scrolls rather than wraps, so the
            toolbar keeps a fixed height as the list scrolls under it. */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          {POSITIONS.map((pos) => (
            <Pill
              key={pos}
              active={position === pos}
              onClick={() => {
                setPosition(pos);
                setPage(1);
              }}
            >
              {pos}
            </Pill>
          ))}
        </div>
      </div>

      {/* One legend covers every tile's stat strip, since the same abbreviations
          repeat on every tile in the grid below. Hidden on a phone, where the
          compact rows show none of them - a legend for abbreviations that
          aren't on screen is seven more info triggers and nothing else. */}
      <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:flex">
        <span className="flex items-center gap-1">
          xPts <InfoTooltip term="xPts" />
        </span>
        <span className="flex items-center gap-1">
          GLS <InfoTooltip term="goals" />
        </span>
        <span className="flex items-center gap-1">
          AST <InfoTooltip term="assists" />
        </span>
        <span className="flex items-center gap-1">
          xGI <InfoTooltip term="xgi" />
        </span>
        <span className="flex items-center gap-1">
          Value <InfoTooltip term="value" />
        </span>
        <span className="flex items-center gap-1">
          Own% <InfoTooltip term="ownership" />
        </span>
        <span className="flex items-center gap-1">
          Fixtures <InfoTooltip term="fdr" />
        </span>
      </div>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      {loading && !players && (
        <div className={GRID_CLASS}>
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <PlayerListCardSkeleton key={i} />
          ))}
        </div>
      )}

      {players && (
        <>
          <div className={GRID_CLASS}>
            {visible.map((p) => (
              <PlayerListCard key={p.id} p={p} inDraft={draftSet.has(p.id)} />
            ))}
          </div>

          {rows.length === 0 &&
            (shortlistOnly && shortlist.length === 0 ? (
              <p className="text-sm text-text-muted">
                Your shortlist is empty. Tap the ☆ on any player to add them here.
              </p>
            ) : (
              <p className="text-sm text-text-muted">No players match those filters.</p>
            ))}

          {rows.length > 0 && (
            <div className="flex flex-col items-center gap-2 pt-1">
              <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
              <p className="text-xs text-text-muted">
                Showing{" "}
                <span className="font-mono">
                  {start + 1}-{start + visible.length}
                </span>{" "}
                of <span className="font-mono">{rows.length}</span>
                {" · sorted by "}
                {SORTS.find((s) => s.key === sortKey)?.label}
              </p>
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
