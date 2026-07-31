"use client";

import type { ReactNode } from "react";

export type SquadRead = "transfers" | "captaincy" | "chips" | "strength" | "detail" | "planner";

export type ReadRow = {
  id: SquadRead;
  label: string;
  /** One-line readout, so the rail still says something with nothing open. */
  summary: ReactNode;
};

/**
 * The single control for the squad page's deep reads. It replaces a tab bar
 * plus four summary cards that between them offered two ways to reach the same
 * content (and two rows that reached the *same* tab), and it keeps the pitch
 * on screen: choosing a read opens it in the Inspector beside the team sheet
 * rather than replacing the page.
 *
 * Each row carries its own summary, so at rest this is both the menu and the
 * overview - the job the four cards were doing, in a quarter of the space.
 */
export function SquadReadRail({
  rows,
  active,
  onSelect,
}: {
  rows: ReadRow[];
  active: SquadRead | null;
  onSelect: (id: SquadRead) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
      <p className="border-b border-border px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted">
        Reads
      </p>
      <ul>
        {rows.map((row) => {
          const isActive = active === row.id;
          return (
            <li key={row.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                aria-expanded={isActive}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-fast ease-standard ${
                  isActive ? "bg-pl-purple/5" : "hover:bg-surface-sunken"
                }`}
              >
                {/* Active marker as a filled bar rather than a colour swap: it
                    reads at a glance without restating the row in purple. */}
                <span
                  aria-hidden="true"
                  className={`h-8 w-[3px] shrink-0 rounded-full transition-colors duration-fast ease-standard ${
                    isActive ? "bg-pl-purple" : "bg-transparent"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm ${
                      isActive ? "font-semibold text-pl-purple" : "font-medium text-text-primary"
                    }`}
                  >
                    {row.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-text-secondary">
                    {row.summary}
                  </span>
                </span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 transition-colors duration-fast ease-standard ${
                    isActive ? "text-pl-purple" : "text-text-muted"
                  }`}
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
