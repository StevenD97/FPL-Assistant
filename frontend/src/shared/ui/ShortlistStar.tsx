"use client";

import { toggleShortlist, useShortlist } from "@/shared/lib/shortlist";

// Star toggle for the personal shortlist. Stops propagation so it can sit
// inside a card link or a click-to-select row without triggering them.
export function ShortlistStar({ id, className = "" }: { id: number; className?: string }) {
  const ids = useShortlist();
  const active = ids.includes(id);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleShortlist(id);
      }}
      aria-pressed={active}
      aria-label={active ? "Remove from shortlist" : "Add to shortlist"}
      title={active ? "On your shortlist" : "Add to shortlist"}
      className={`leading-none transition-colors ${
        active ? "text-pl-yellow" : "text-slate-300 hover:text-pl-yellow"
      } ${className}`}
    >
      <span aria-hidden="true">{active ? "★" : "☆"}</span>
    </button>
  );
}
