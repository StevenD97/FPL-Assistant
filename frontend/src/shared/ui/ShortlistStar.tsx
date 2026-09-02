"use client";

import { toggleShortlist, useShortlist } from "@/shared/lib/shortlist";
import { useFlash } from "@/shared/lib/useFlash";

// Star toggle for the personal shortlist. Stops propagation so it can sit
// inside a card link or a click-to-select row without triggering them.
export function ShortlistStar({ id, className = "" }: { id: number; className?: string }) {
  const ids = useShortlist();
  const active = ids.includes(id);
  const { flash, isFlashed } = useFlash();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // Pop on the way in only. Adding is the act worth confirming; removing
        // already reads clearly from the star emptying, and a celebration on
        // "undo" would be the wrong note.
        if (!active) flash(id);
        toggleShortlist(id);
      }}
      aria-pressed={active}
      aria-label={active ? "Remove from shortlist" : "Add to shortlist"}
      title={active ? "On your shortlist" : "Add to shortlist"}
      className={`leading-none transition-colors ${
        active ? "text-pl-yellow" : "text-slate-300 hover:text-pl-yellow"
      } ${className}`}
    >
      <span aria-hidden="true" className={`inline-block ${isFlashed(id) ? "animate-fpl-pop" : ""}`}>
        {active ? "★" : "☆"}
      </span>
    </button>
  );
}
