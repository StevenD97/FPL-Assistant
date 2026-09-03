"use client";

import type { ReactNode } from "react";

export type SquadRead =
  | "transfers"
  | "captaincy"
  | "chips"
  | "fixtures"
  | "differentials"
  | "strength"
  | "detail"
  | "setup";

/**
 * One accent per read, drawn from the semantic palette rather than seven
 * arbitrary hues, so the set reads as designed instead of as noise. Colour plus
 * glyph makes each row recognisable before it's read - which is the point of a
 * menu you return to repeatedly.
 *
 * `setup` deliberately takes the quietest tone in the set. It belongs in the rail
 * because it's the same shape of interaction as the rest - pick a row, it opens
 * beside the team sheet - but it's the one row you visit once rather than return
 * to, so it shouldn't compete with the reads that carry an answer.
 */
const TONES: Record<SquadRead, { icon: string; text: string; tint: string; bar: string }> = {
  transfers: { icon: "text-success", text: "text-success", tint: "bg-success-bg", bar: "bg-success" },
  captaincy: { icon: "text-text-primary", text: "text-text-primary", tint: "bg-ink-900/10", bar: "bg-ink-900" },
  chips: { icon: "text-warning", text: "text-warning", tint: "bg-warning-bg", bar: "bg-warning" },
  // A muted plum for the schedule: fixture difficulty is the one read whose
  // *content* is colour-coded (green-to-red FDR chips), so the row itself takes a
  // neutral brand tone rather than competing with the scale inside it.
  fixtures: {
    icon: "text-brand-strong",
    text: "text-brand-strong",
    tint: "bg-ink-700/10",
    bar: "bg-ink-700",
  },
  // danger, the boldest accent in the palette, for the row about bold picks.
  differentials: { icon: "text-danger", text: "text-danger", tint: "bg-danger/10", bar: "bg-danger" },
  strength: { icon: "text-info", text: "text-info", tint: "bg-info-bg", bar: "bg-info" },
  detail: { icon: "text-ink-600", text: "text-ink-600", tint: "bg-ink-100", bar: "bg-ink-600" },
  setup: { icon: "text-ink-500", text: "text-ink-500", tint: "bg-ink-100", bar: "bg-ink-400" },
};

export type ReadRow = {
  id: SquadRead;
  label: string;
  /** One-line readout, so the rail still says something with nothing open. */
  summary: ReactNode;
  /**
   * In the rail, but not a read. Sits below a divider and is left out of the
   * header count, so "Reads 6" keeps meaning six answers about the squad even
   * though setup shares the same list and the same panel.
   */
  aside?: boolean;
};

/**
 * The single control for the squad page's deep reads. It replaces a tab bar
 * plus four summary cards that between them offered two ways to reach the same
 * content (and two rows that reached the *same* tab), and it keeps the pitch on
 * screen: choosing a read opens it in the Inspector beside the team sheet rather
 * than replacing the page.
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
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <p className="flex items-center gap-2 border-b border-border bg-surface-sunken px-4 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-text-muted">
        Reads
        <span className="font-mono text-xs font-semibold normal-case tracking-normal text-text-muted/70">
          {rows.filter((r) => !r.aside).length}
        </span>
      </p>
      <ul>
        {rows.map((row, i) => {
          const isActive = active === row.id;
          const tone = TONES[row.id];
          // A heavier rule where the asides begin, so setup reads as attached to
          // the rail rather than as a seventh answer.
          const startsAsides = row.aside && !rows[i - 1]?.aside;
          return (
            <li
              key={row.id}
              className={`border-b border-border last:border-b-0 ${
                startsAsides ? "border-t-2 border-t-border" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                aria-expanded={isActive}
                className={`group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-fast ease-standard ${
                  isActive ? "bg-ink-900/[0.06]" : "hover:bg-surface-sunken"
                }`}
              >
                {/* Active marker as a filled bar rather than a colour swap: it
                    reads at a glance without restating the row. */}
                <span
                  aria-hidden="true"
                  className={`h-9 w-[3px] shrink-0 rounded-full transition-colors duration-fast ease-standard ${
                    isActive ? tone.bar : "bg-transparent"
                  }`}
                />
                <span
                  aria-hidden="true"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-transform duration-base ease-standard group-hover:scale-105 ${tone.tint} ${tone.icon}`}
                >
                  <ReadIcon id={row.id} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-semibold ${
                      isActive ? "text-brand" : "text-text-primary"
                    }`}
                  >
                    {row.label}
                  </span>
                  <span className="mt-0.5 block truncate text-xs leading-snug text-text-secondary">
                    {row.summary}
                  </span>
                </span>
                {/* Nudges toward the panel it opens on hover. */}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 transition-transform duration-base ease-standard group-hover:translate-x-0.5 ${
                    isActive ? "text-brand" : "text-ink-300"
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

/** 24x24 stroke glyphs, matching the nav icon set rather than adding a library. */
function ReadIcon({ id }: { id: SquadRead }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.1,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-[18px] w-[18px]",
    "aria-hidden": true,
  };
  switch (id) {
    case "transfers":
      // Two opposing arrows - the universal swap glyph.
      return (
        <svg {...common}>
          <path d="M3 8h15m0 0-4-4m4 4-4 4" />
          <path d="M21 16H6m0 0 4-4m-4 4 4 4" />
        </svg>
      );
    case "captaincy":
      // Armband on a sleeve.
      return (
        <svg {...common}>
          <path d="M7 4h10v16H7z" />
          <path d="M4 9h16" />
          <path d="M4 14h16" />
        </svg>
      );
    case "chips":
      // A stack of tokens.
      return (
        <svg {...common}>
          <ellipse cx="12" cy="6" rx="8" ry="3" />
          <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
          <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
        </svg>
      );
    case "fixtures":
      // A road ahead - the run of games as a stretch to travel, rather than a
      // calendar grid, which is what the Transfer Plan workspace is for.
      return (
        <svg {...common}>
          <path d="M4 21 9 4M20 21 15 4" />
          <path d="M12 6v2M12 12v2M12 18v2" />
        </svg>
      );
    case "differentials":
      // One mark stepping out of the row - the whole idea of a differential.
      return (
        <svg {...common}>
          <circle cx="5" cy="17" r="1.6" />
          <circle cx="11" cy="17" r="1.6" />
          <circle cx="17" cy="17" r="1.6" />
          <path d="M17 12V4m0 0-2.5 2.5M17 4l2.5 2.5" />
        </svg>
      );
    case "strength":
      // Bars, ascending.
      return (
        <svg {...common}>
          <path d="M5 20v-5" />
          <path d="M12 20V8" />
          <path d="M19 20V4" />
        </svg>
      );
    case "detail":
      // Rows of a table.
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h16M4 18h16" />
          <path d="M9 6v12" />
        </svg>
      );
    case "setup":
      // Sliders - settings rather than a cog, since these are values you dial in
      // rather than options you switch on.
      return (
        <svg {...common}>
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx="16" cy="7" r="2.2" />
          <circle cx="8" cy="17" r="2.2" />
        </svg>
      );
  }
}
