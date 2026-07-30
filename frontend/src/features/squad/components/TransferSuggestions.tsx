"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getAlternatives } from "@/shared/api/squad";
import type { PlayerAlternative } from "@/shared/types/api";

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
  maxCost,
  excludeIds,
  onSelect,
  trigger,
  triggerClassName = "",
}: {
  /** Live 2026/27 player id - what /api/players/{id}/alternatives expects. */
  playerId: number;
  playerName: string;
  maxCost: number;
  excludeIds: number[];
  /** Performs the swap in place - always provided; there's no read-only mode. */
  onSelect: (candidateId: number) => void;
  /** Custom trigger content (e.g. a "Suggest" text link) - defaults to the icon glyph. */
  trigger?: React.ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<PlayerAlternative[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
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
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="animate-fpl-fade relative w-full max-w-xs rounded-lg border border-border bg-white p-4 shadow-lg"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span id={titleId} className="text-sm font-semibold text-text-primary">
                  Replace {playerName}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="text-lg leading-none text-text-muted hover:text-text-primary"
                >
                  ×
                </button>
              </div>

              {loading && <p className="text-sm text-text-muted">Finding replacements…</p>}
              {!loading && error && <p className="text-sm text-danger">Couldn&apos;t load suggestions.</p>}
              {!loading && !error && candidates && candidates.length === 0 && (
                <p className="text-sm text-text-muted">No affordable replacements found.</p>
              )}
              {!loading && !error && candidates && candidates.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(c.id);
                          setOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-surface-sunken"
                      >
                        <span className="min-w-0 flex-1 truncate text-left font-medium text-text-primary">
                          {c.web_name} <span className="text-text-muted">({c.team_short})</span>
                        </span>
                        <span className="shrink-0 font-mono text-text-secondary">£{c.cost.toFixed(1)}m</span>
                        <span className="shrink-0 font-mono font-semibold text-pl-purple">
                          {c.predicted_points.toFixed(1)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!loading && !error && candidates && candidates.length > 0 && (
                <p className="mt-3 text-[11px] text-text-muted">
                  Picking one previews the swap in your Transfer planner below.
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
