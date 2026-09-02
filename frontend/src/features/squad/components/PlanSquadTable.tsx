"use client";

import { Card } from "@/shared/ui/Card";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import type { Position } from "@/shared/types/api";
import type { SlotRow, WeeklyProjection } from "../lib/transferPlan";

const POSITION_BORDER: Record<Position, string> = {
  GKP: "border-l-pos-gkp",
  DEF: "border-l-pos-def",
  MID: "border-l-pos-mid",
  FWD: "border-l-pos-fwd",
};

/**
 * The whole plan as one grid: a row per squad slot, a column per gameweek.
 *
 * The pitch above answers "what does my team look like in GW17"; this
 * answers the question you can only ask across weeks - where a player stops
 * being worth their place, where a transfer takes effect, which week the
 * squad as a whole dips. Each cell names its occupant only when that
 * changes, so a row reads as one player until the week they're replaced.
 */
export function PlanSquadTable({
  slotRows,
  events,
  projections,
  selectedEvent,
  onSelectEvent,
}: {
  slotRows: SlotRow[];
  events: number[];
  projections: WeeklyProjection[];
  selectedEvent: number;
  onSelectEvent: (event: number) => void;
}) {
  const projectionByEvent = new Map(projections.map((p) => [p.event, p]));
  // XI first, then the bench - the pitch's own reading order.
  const ordered = [...slotRows].sort((a, b) => {
    if (a.role === b.role) return 0;
    return a.role === "Starting XI" ? -1 : 1;
  });
  const firstBenchIndex = ordered.findIndex((r) => r.role !== "Starting XI");

  const totalsByEvent = new Map(
    events.map((event) => [
      event,
      ordered.reduce((sum, row) => {
        const cell = row.cells.find((c) => c.event === event);
        return sum + (cell?.predictedPoints ?? 0);
      }, 0),
    ]),
  );

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="border-b border-border p-4">
        <h3 className="font-semibold text-text-primary">Your squad, week by week</h3>
        <p className="mt-1 text-xs text-text-muted">
          Predicted points per player per gameweek, with your planned transfers applied. A name appears
          again on the week that slot changes hands.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="table-dense w-full text-left text-sm">
          <thead className="bg-surface-sunken">
            <tr>
              <th className="sticky left-0 bg-surface-sunken px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Player
              </th>
              {events.map((gw) => (
                <th key={gw} className="px-1 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => onSelectEvent(gw)}
                    className={`w-full rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
                      gw === selectedEvent
                        ? "bg-pl-purple text-white"
                        : "text-text-muted hover:bg-pl-purple/10 hover:text-pl-purple"
                    }`}
                  >
                    GW{gw}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((row, i) => (
              <tr
                key={row.outLiveId}
                className={`border-t transition-colors ${
                  i === firstBenchIndex ? "border-t-2 border-t-border-strong" : "border-border"
                }`}
              >
                <td
                  className={`sticky left-0 whitespace-nowrap border-l-4 bg-white px-3 py-2 font-medium ${
                    POSITION_BORDER[row.original.pos]
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>
                      <span className="block text-text-primary">{row.original.web_name}</span>
                      <TeamBadge
                        teamShort={row.original.team_short}
                        name={row.original.team_short}
                        badgeUrl={row.original.team_badge}
                      />
                    </span>
                    {row.role !== "Starting XI" && (
                      <span className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-3xs font-semibold uppercase text-text-muted">
                        Bench
                      </span>
                    )}
                  </span>
                </td>
                {row.cells.map((cell) => {
                  const isBlank = cell.fixtureCount === 0;
                  const hasFlag = cell.flags.length > 0;
                  const tone = isBlank
                    ? "bg-danger-bg"
                    : hasFlag
                      ? "bg-warning-bg"
                      : !cell.isOriginalOccupant
                        ? "bg-pl-purple/5"
                        : "";
                  return (
                    <td
                      key={cell.event}
                      className={`px-2 py-1.5 text-center ${tone} ${
                        cell.event === selectedEvent ? "ring-1 ring-inset ring-pl-purple/30" : ""
                      } ${hasFlag ? "cursor-help" : ""}`}
                      title={cell.flags.length > 0 ? cell.flags.join(" · ") : undefined}
                    >
                      {/* Only name the occupant on the week they take over -
                          repeating it in every cell would bury the one week
                          the row actually changes. */}
                      {cell.transferStartsHere && (
                        <span className="mb-0.5 block truncate text-3xs font-semibold text-pl-purple">
                          ↳ {cell.occupant.web_name}
                        </span>
                      )}
                      <span className="font-mono text-text-primary">
                        {cell.predictedPoints != null ? cell.predictedPoints.toFixed(1) : "–"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border-strong bg-surface-sunken">
              <td className="sticky left-0 bg-surface-sunken px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Squad total
              </td>
              {events.map((event) => {
                const proj = projectionByEvent.get(event);
                return (
                  <td
                    key={event}
                    className={`px-2 py-2 text-center ${
                      event === selectedEvent ? "ring-1 ring-inset ring-pl-purple/30" : ""
                    }`}
                  >
                    <span className="block font-mono text-sm font-bold text-text-primary">
                      {(totalsByEvent.get(event) ?? 0).toFixed(0)}
                    </span>
                    {proj && proj.hitPoints > 0 && (
                      <span className="block font-mono text-3xs font-semibold text-danger">
                        -{proj.hitPoints} hit
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
