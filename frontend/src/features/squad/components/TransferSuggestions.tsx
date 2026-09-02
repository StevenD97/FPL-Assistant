"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getAlternatives, searchPlayers } from "@/shared/api/squad";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import type { PlayerAlternative, PlayerListItem, Position } from "@/shared/types/api";

/**
 * What a row here needs. The ranked shortlist returns PlayerAlternative and
 * search returns PlayerListItem; the latter is a superset, so both render
 * through one path and both satisfy `onSelect` without any mapping.
 */
// PlayerAlternative now carries status/news itself. This used to widen it
// with optional copies so StatusBadge below would type-check - which it did,
// silently, while the backend sent neither and the badge never rendered.
type Candidate = PlayerAlternative;

/** Long enough that typing a name doesn't fire a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 250;

// Two opposing arrows - the universal "swap" glyph, drawn in the same 24x24
// stroke style as the nav icons (shared/layout/icons.tsx) rather than pulling
// in an icon library for one glyph.
function TransferGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 8h15m0 0-4-4m4 4-4 4" />
      <path d="M21 16H6m0 0 4-4m-4 4 4 4" />
    </svg>
  );
}

/**
 * "Find a replacement" affordance for a squad player: a small trigger that
 * opens a modal listing the top 3 same-position players affordable within
 * `maxCost` (typically bank + this player's own price - what selling them
 * would free up). Picking one calls onSelect - it never navigates away, so
 * the result is always visible without hunting for it further down the page
 * (a modal rather than an anchored popover, so it lands the same way
 * regardless of where the trigger sits on a long, scrolled page - the pitch,
 * the bench, or a table row).
 */
export function TransferSuggestions({
  playerId,
  playerName,
  position,
  maxCost,
  excludeIds,
  onSelect,
  trigger,
  triggerClassName = "",
}: {
  /** Live 2026/27 player id - what /api/players/{id}/alternatives expects. */
  playerId: number;
  playerName: string;
  /** The outgoing player's position - search only offers players who can legally take this slot. */
  position: Position;
  maxCost: number;
  excludeIds: number[];
  /**
   * Performs the swap in place - always provided; there's no read-only mode.
   * The full candidate rides along too, so a caller can track its cost (the
   * alternatives list is the only place that price is fetched) without a
   * second round trip.
   */
  onSelect: (candidateId: number, candidate: PlayerAlternative) => void;
  /** Custom trigger content (e.g. a "Suggest" text link) - defaults to the icon glyph. */
  trigger?: React.ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<PlayerAlternative[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PlayerListItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Debounced in the change handler rather than an effect: the effect version
  // has to clear results on an emptied box, which is a synchronous setState in
  // an effect body - the exact pattern this codebase lints against.
  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (!q) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const rows = await searchPlayers({ search: q, position });
        setResults(rows);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  function closeModal() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setOpen(false);
  }

  async function openModal(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
    if (candidates === null && !loading) {
      setLoading(true);
      setError(false);
      try {
        const rows = await getAlternatives(playerId, { limit: 3, exclude: excludeIds, maxCost });
        setCandidates(rows);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
  }

  const isSearching = search.trim().length > 0;
  // Anyone already in the squad can't also be a replacement. Applied here for
  // search because, unlike the alternatives endpoint, /api/players has no
  // notion of who you already own.
  const shownResults = (results ?? []).filter((p) => !excludeIds.includes(p.id));

  function renderRow(c: Candidate) {
    const overBudget = c.cost > maxCost + 0.001;
    return (
      <li key={c.id}>
        <button
          type="button"
          onClick={() => {
            onSelect(c.id, c);
            closeModal();
          }}
          className="flex w-full items-center gap-2 rounded-md border border-border bg-surface-sunken/60 px-2 py-2 text-sm hover:border-pl-purple/40 hover:bg-pl-purple/5"
        >
          <PlayerPhoto
            src={c.player_photo}
            name={c.web_name}
            className="h-8 w-8 shrink-0 rounded-full border border-border-strong bg-white object-cover object-top text-3xs"
          />
          <span className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-1">
              <span className="truncate font-medium text-text-primary">{c.web_name}</span>
              <StatusBadge status={c.status} news={c.news} />
            </span>
            <TeamBadge teamShort={c.team_short} name={c.team_short} badgeUrl={c.team_badge} />
          </span>
          <span className="shrink-0 text-right">
            <span
              className={`block font-mono ${overBudget ? "font-semibold text-danger" : "text-text-secondary"}`}
              title={overBudget ? "More than your bank covers - the shortfall shows in your squad's bank" : undefined}
            >
              £{c.cost.toFixed(1)}m
            </span>
            <span className="block font-mono font-semibold text-pl-purple">{c.predicted_points.toFixed(1)}</span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <>
      {trigger ? (
        <button type="button" onClick={openModal} className={triggerClassName}>
          {trigger}
        </button>
      ) : (
        <button
          type="button"
          onClick={openModal}
          aria-label={`Find a replacement for ${playerName}`}
          className={`flex items-center justify-center rounded-full bg-pl-purple text-white shadow ring-2 ring-white transition-transform hover:scale-110 ${triggerClassName}`}
        >
          <TransferGlyph className="h-3 w-3" />
        </button>
      )}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              className="animate-fpl-fade absolute inset-0 bg-black/50"
              onClick={closeModal}
              aria-hidden="true"
            />
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="animate-fpl-fade relative flex max-h-[80vh] w-full max-w-sm flex-col rounded-lg border border-border bg-white p-4 shadow-lg"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span id={titleId} className="text-sm font-semibold text-text-primary">
                  Replace {playerName}
                </span>
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Close"
                  className="text-lg leading-none text-text-muted hover:text-text-primary"
                >
                  ×
                </button>
              </div>

              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={`Search any ${position} by name or team…`}
                aria-label={`Search for a ${position} to replace ${playerName}`}
                className="mb-3 w-full rounded-md border border-border px-2.5 py-1.5 text-sm text-text-primary"
              />

              <div className="min-h-0 flex-1 overflow-y-auto">
                {isSearching ? (
                  <>
                    {searching && <p className="text-sm text-text-muted">Searching…</p>}
                    {!searching && shownResults.length === 0 && (
                      <p className="text-sm text-text-muted">
                        No {position} matches &ldquo;{search.trim()}&rdquo;.
                      </p>
                    )}
                    {!searching && shownResults.length > 0 && (
                      <ul className="flex flex-col gap-1.5">{shownResults.map(renderRow)}</ul>
                    )}
                  </>
                ) : (
                  <>
                    {loading && <p className="text-sm text-text-muted">Finding replacements…</p>}
                    {!loading && error && <p className="text-sm text-danger">Couldn&apos;t load suggestions.</p>}
                    {!loading && !error && candidates && candidates.length === 0 && (
                      <p className="text-sm text-text-muted">
                        No affordable replacements found - search above to pick anyone.
                      </p>
                    )}
                    {!loading && !error && candidates && candidates.length > 0 && (
                      <>
                        <p className="mb-1.5 text-2xs font-bold uppercase tracking-[0.08em] text-text-muted">
                          Top picks in your budget
                        </p>
                        <ul className="flex flex-col gap-1.5">{candidates.map(renderRow)}</ul>
                      </>
                    )}
                  </>
                )}
              </div>

              <p className="mt-3 shrink-0 text-[11px] text-text-muted">
                {isSearching
                  ? "Search covers every player, including ones your bank doesn't cover yet - the shortfall shows in your squad's bank."
                  : "Swaps them in here as a preview - not submitted to FPL."}
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
