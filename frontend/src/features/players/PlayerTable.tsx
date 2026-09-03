"use client";

import Link from "next/link";

import { PositionBadge } from "@/shared/ui/PositionBadge";
import { ShortlistStar } from "@/shared/ui/ShortlistStar";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import type { PlayerListItem } from "@/shared/types/api";
import type { SortKey } from "@/features/players/sort";

/**
 * The desktop player list, as a table.
 *
 * Cards are the right answer on a phone and the wrong one on a 1440px display.
 * Four cards a row means four players compared at a time, each number in a
 * different place on the screen, with a card's worth of chrome around every
 * one - and comparing players is the entire reason this page exists. A table
 * puts twenty on screen with every value in a column, which is how anyone
 * actually reads a list of numbers.
 *
 * It is also what every serious competitor does, and being the one tool that
 * makes you scroll through tiles to compare a midfielder to a midfielder is not
 * a differentiator.
 *
 * Below `lg` the cards stay. A table at 390px is either a horizontal scroll or
 * a set of columns squeezed past reading, and the phone view is for finding a
 * name and a number rather than for research.
 */
const COLUMNS: {
  key: SortKey | null;
  label: string;
  align?: "right";
  /** Hidden until there is room, in the order they can be spared. */
  at?: string;
}[] = [
  { key: null, label: "Player" },
  { key: null, label: "Team" },
  { key: null, label: "Pos" },
  { key: "cost", label: "Price", align: "right" },
  { key: "predicted_points", label: "xPts 5GW", align: "right" },
  { key: "value", label: "Value", align: "right", at: "xl:table-cell" },
  { key: "season_points", label: "Season", align: "right", at: "xl:table-cell" },
  { key: "selected_by_percent", label: "Owned", align: "right" },
  { key: null, label: "", align: "right" },
];

export function PlayerTable({
  players,
  sortKey,
  onSort,
  draftIds,
}: {
  players: PlayerListItem[];
  sortKey: SortKey;
  onSort: (key: SortKey) => void;
  draftIds: Set<number>;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        {/* Sticky so the columns stay named while you scroll a page of sixty. */}
        <thead className="sticky top-0 z-[1] bg-surface-sunken">
          <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-[0.06em] text-text-muted">
            {COLUMNS.map((col) => {
              const sorted = col.key != null && col.key === sortKey;
              return (
                <th
                  key={col.label || "actions"}
                  scope="col"
                  aria-sort={sorted ? "descending" : undefined}
                  className={`px-3 py-2.5 font-bold ${col.align === "right" ? "text-right" : ""} ${
                    col.at ? `hidden ${col.at}` : ""
                  }`}
                >
                  {col.key ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key as SortKey)}
                      className={`inline-flex items-center gap-1 uppercase tracking-[0.06em] hover:text-text-primary ${
                        sorted ? "text-text-primary" : ""
                      }`}
                    >
                      {col.label}
                      {/* Only the active column shows a caret. An arrow on every
                          header is decoration; one arrow is information. */}
                      {sorted && <span aria-hidden>↓</span>}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const stats = p.season_stats;
            return (
              <tr
                key={p.id}
                className="border-b border-border/60 last:border-0 hover:bg-surface-sunken/60"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/players/${p.id}`}
                    className="font-semibold text-text-primary hover:underline"
                  >
                    {p.web_name}
                  </Link>
                  {draftIds.has(p.id) && (
                    <span className="ml-2 rounded-sm bg-brand-wash px-1.5 py-0.5 text-xs font-bold uppercase text-brand">
                      In draft
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-text-secondary">{p.team_short}</td>
                <td className="px-3 py-2">
                  <PositionBadge position={p.position} />
                </td>
                <td className="px-3 py-2 text-right font-mono text-text-secondary">
                  £{p.cost.toFixed(1)}m
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-text-primary">
                  {p.predicted_points.toFixed(1)}
                </td>
                <td className="hidden px-3 py-2 text-right font-mono text-text-secondary xl:table-cell">
                  {(p.predicted_points / p.cost).toFixed(2)}
                </td>
                <td className="hidden px-3 py-2 text-right font-mono text-text-secondary xl:table-cell">
                  {stats ? stats.total_points : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-text-secondary">
                  {p.selected_by_percent.toFixed(1)}%
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center justify-end gap-1">
                    <StatusBadge status={p.status} news={p.news} />
                    <ShortlistStar id={p.id} className="flex h-9 w-9 items-center justify-center" />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
