"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { getAlternatives } from "@/shared/api/squad";
import type { PlayerAlternative } from "@/shared/types/api";

type Coords = { top: number; left: number; placement: "top" | "bottom" };

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
 * Tiny "find a replacement" affordance for a squad player: an icon that
 * opens a small popover of the top 3 same-position players affordable
 * within `maxCost` (typically bank + this player's own price - what
 * selling them would free up).
 */
export function TransferSuggestions({
  playerId,
  playerName,
  maxCost,
  excludeIds,
  triggerClassName = "",
}: {
  /** Live 2026/27 player id - what /api/players/{id}/alternatives expects. */
  playerId: number;
  playerName: string;
  maxCost: number;
  excludeIds: number[];
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [candidates, setCandidates] = useState<PlayerAlternative[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const placement: Coords["placement"] = window.innerHeight - rect.bottom < 220 ? "top" : "bottom";
      const left = Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140);
      const top = placement === "bottom" ? rect.bottom + 6 : rect.top - 6;
      setCoords({ top, left, placement });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    function handleOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      // The popover is portaled to document.body, so it's not a descendant
      // of triggerRef - without this check, a mousedown on a suggestion link
      // reads as "outside", closing (and unmounting) the popover before the
      // click that should have navigated ever fires.
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function toggle(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const next = !open;
    setOpen(next);
    if (next && candidates === null && !loading) {
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
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label={`Find a replacement for ${playerName}`}
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        className={`flex items-center justify-center rounded-full bg-pl-purple text-white shadow ring-2 ring-white transition-transform hover:scale-110 ${triggerClassName}`}
      >
        <TransferGlyph className="h-3 w-3" />
      </button>
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={popoverId}
            ref={popoverRef}
            role="dialog"
            aria-label={`Replacement options for ${playerName}`}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              transform: `translate(-50%, ${coords.placement === "bottom" ? "0" : "-100%"})`,
            }}
            className="z-[100] w-64 rounded-lg border border-border bg-white p-3 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-text-primary">Replace {playerName}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-text-muted hover:text-text-primary"
              >
                ×
              </button>
            </div>

            {loading && <p className="text-xs text-text-muted">Finding replacements…</p>}
            {!loading && error && <p className="text-xs text-danger">Couldn&apos;t load suggestions.</p>}
            {!loading && !error && candidates && candidates.length === 0 && (
              <p className="text-xs text-text-muted">No affordable replacements found.</p>
            )}
            {!loading && !error && candidates && candidates.length > 0 && (
              <ul className="flex flex-col gap-1">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <PlayerLink
                      id={c.id}
                      className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-surface-sunken"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                        {c.web_name} <span className="text-text-muted">({c.team_short})</span>
                      </span>
                      <span className="shrink-0 font-mono text-text-secondary">£{c.cost.toFixed(1)}m</span>
                      <span className="shrink-0 font-mono font-semibold text-pl-purple">
                        {c.predicted_points.toFixed(1)}
                      </span>
                    </PlayerLink>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
