"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Alert } from "@/shared/ui/Alert";
import { Card } from "@/shared/ui/Card";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { GameweekStrip } from "./GameweekStrip";
import { TransferPlanPicker } from "./TransferPlanPicker";
import { BlankGameweekAdvisor, BLANK_THRESHOLD, findFlaggedWeeks } from "./BlankGameweekAdvisor";
import {
  budgetForNewEntry,
  buildSlotRows,
  computeWeeklyProjection,
  currentOccupantForGw,
  type PlanEntry,
} from "../lib/transferPlan";
import type { ChipResponse, PlannerResponse, PoolPlayer, Position, SquadPlayer } from "@/shared/types/api";

const POSITION_BORDER: Record<Position, string> = {
  GKP: "border-l-pos-gkp",
  DEF: "border-l-pos-def",
  MID: "border-l-pos-mid",
  FWD: "border-l-pos-fwd",
};

/** Step 1 of adding a transfer: which of the 15 slots is leaving, as of this
 * gameweek - shows whoever's actually occupying it by then under the plan so
 * far, not necessarily who you own today. */
function SlotChooserModal({
  squad,
  entries,
  gwEvent,
  onPick,
  onClose,
}: {
  squad: SquadPlayer[];
  entries: PlanEntry[];
  gwEvent: number;
  onPick: (original: SquadPlayer) => void;
  onClose: () => void;
}) {
  const owned = squad.filter((p) => p.live_id != null);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="animate-fpl-fade absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className="animate-fpl-fade relative flex max-h-[80vh] w-full max-w-sm flex-col rounded-lg border border-border bg-white shadow-lg"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <p className="text-sm font-semibold text-text-primary">Who&apos;s leaving in GW{gwEvent}?</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-lg leading-none text-text-muted hover:text-text-primary"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <ul className="flex flex-col gap-1">
            {owned.map((p) => {
              const occupant = currentOccupantForGw(p, entries, gwEvent - 1);
              return (
                <li key={p.live_id}>
                  <button
                    type="button"
                    onClick={() => onPick(p)}
                    className="flex w-full items-center gap-2 rounded-md border border-border bg-surface-sunken/60 px-2 py-1.5 text-sm hover:border-pl-purple/40 hover:bg-pl-purple/5"
                  >
                    <PlayerPhoto
                      src={occupant.player_photo}
                      name={occupant.web_name}
                      className="h-8 w-8 shrink-0 rounded-full border border-border-strong bg-white object-cover object-top text-3xs"
                    />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-text-primary">{occupant.web_name}</span>
                        <PositionBadge position={occupant.position} />
                      </span>
                      <TeamBadge teamShort={occupant.team_short} name={occupant.team_short} badgeUrl={occupant.team_badge} />
                    </span>
                    <span className="shrink-0 font-mono text-text-secondary">£{occupant.cost.toFixed(1)}m</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * "In GW16 I plan to swap Senesi for Munoz" - a sandbox for stacking
 * transfers across several future gameweeks, not just previewing one swap
 * for right now. Points, free transfers and bank all update across the
 * whole window as entries are added, so a run of moves aimed at a specific
 * future gameweek (a blank, a double, a fixture swing) can actually be built
 * and checked before any of it becomes real.
 *
 * Deliberately independent of the pitch/detail-table swap preview above -
 * that's "what if I transferred right now"; this is "what if, over the next
 * several weeks" - mixing the two would answer neither question cleanly.
 */
export function TransferPlanBoard({
  planner,
  loading,
  error,
  squad,
  bank,
  freeTransfers,
  chips,
  chipsLoading,
  teamId,
  entries,
  addingKey,
  addError,
  onAdd,
  onRemove,
  onClearAll,
  pool,
  poolLoading,
  openPickerFor,
  onOpenPickerHandled,
}: {
  planner: PlannerResponse | null;
  loading: boolean;
  error: string | null;
  squad: SquadPlayer[];
  /** The squad's real, current bank - this plan is its own what-if, independent
   * of any pitch/detail-table swap preview also open elsewhere. */
  bank: number;
  freeTransfers: number;
  chips: ChipResponse | null;
  chipsLoading: boolean;
  teamId: string;
  entries: PlanEntry[];
  addingKey: string | null;
  addError: string | null;
  onAdd: (outLiveId: number, gwEvent: number, candidate: PoolPlayer) => void;
  onRemove: (outLiveId: number, gwEvent: number) => void;
  onClearAll: () => void;
  /** Shared with the workspace around this board - one fetch of the whole
   * player pool serves the candidate picker here as well as the
   * recommendation and squad-radar cost lookups above it. */
  pool: PoolPlayer[] | null;
  poolLoading: boolean;
  /** Set by a caller outside this board (a recommendation, a flagged-gameweek
   * radar item) to jump straight to the candidate picker for that slot and
   * gameweek, skipping the "who's leaving" step since the caller already
   * knows. Cleared via onOpenPickerHandled once consumed. */
  openPickerFor?: { gwEvent: number; outLiveId: number } | null;
  onOpenPickerHandled?: () => void;
}) {
  const [choosingSlotFor, setChoosingSlotFor] = useState<number | null>(null);
  const [internalPickingFor, setInternalPickingFor] = useState<{ gwEvent: number; original: SquadPlayer } | null>(
    null,
  );
  const [showMatrix, setShowMatrix] = useState(false);

  // openPickerFor is a request from outside this board (a recommendation, a
  // radar item) - derived rather than mirrored into state, so there's
  // nothing to synchronise: the picker is open exactly when the request
  // resolves to a real slot, and closing it clears the request itself
  // (below) rather than a local copy of it.
  const externalPickingFor = useMemo(() => {
    if (!openPickerFor) return null;
    const original = squad.find((p) => p.live_id === openPickerFor.outLiveId);
    return original ? { gwEvent: openPickerFor.gwEvent, original } : null;
  }, [openPickerFor, squad]);
  const pickingFor = internalPickingFor ?? externalPickingFor;

  function closePicker() {
    setInternalPickingFor(null);
    if (externalPickingFor) onOpenPickerHandled?.();
  }

  const slotRows = useMemo(() => (planner ? buildSlotRows(squad, planner, entries) : []), [planner, squad, entries]);
  const projection = useMemo(
    () => (planner ? computeWeeklyProjection(entries, squad, planner.next_events, freeTransfers, bank) : []),
    [planner, entries, squad, freeTransfers, bank],
  );
  const projectionByEvent = useMemo(() => new Map(projection.map((p) => [p.event, p])), [projection]);

  const baselineByEvent = useMemo(() => {
    const map = new Map<number, number>();
    if (!planner) return map;
    for (const event of planner.next_events) {
      let total = 0;
      for (const p of planner.players) {
        const row = p.trajectory.find((t) => t.event === event);
        if (row) total += row.predicted_points;
      }
      map.set(event, total);
    }
    return map;
  }, [planner]);

  const planPointsByEvent = useMemo(() => {
    const map = new Map<number, number>();
    if (!planner) return map;
    for (const event of planner.next_events) {
      let total = 0;
      for (const row of slotRows) {
        const cell = row.cells.find((c) => c.event === event);
        if (cell?.predictedPoints != null) total += cell.predictedPoints;
      }
      map.set(event, total);
    }
    return map;
  }, [planner, slotRows]);

  const flaggedByEvent = useMemo(() => {
    const map = new Map<number, { blankCount: number; doubleCount: number }>();
    if (!chips) return map;
    for (const week of findFlaggedWeeks(chips)) map.set(week.event, week);
    return map;
  }, [chips]);

  async function handlePick(candidate: PoolPlayer) {
    if (!pickingFor) return;
    const outLiveId = pickingFor.original.live_id as number;
    const gwEvent = pickingFor.gwEvent;
    closePicker();
    onAdd(outLiveId, gwEvent, candidate);
  }

  return (
    <div className="space-y-4">
      {loading && <p className="text-sm text-text-muted">Building your outlook…</p>}
      {error && (
        <Alert kind="warning">Couldn&apos;t build the planner ({error}).</Alert>
      )}

      {planner && (
        <>
          <Card>
            <GameweekStrip planner={planner} />
          </Card>

          <Card padded={false}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">Your plan</h4>
                <p className="mt-0.5 text-xs text-text-muted">
                  Add a swap to any week ahead and see points, free transfers, and bank update across the
                  whole window - nothing here is submitted to FPL until you actually make the transfer.
                </p>
              </div>
              {entries.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="text-xs font-semibold text-pl-purple hover:underline"
                >
                  Clear all ({entries.length})
                </button>
              )}
            </div>
            {addError && (
              <div className="p-4 pb-0">
                <Alert kind="warning">{addError}</Alert>
              </div>
            )}
            <ul className="flex flex-col gap-2 p-4">
              {planner.next_events.map((event) => {
                const weekEntries = entries.filter((e) => e.gwEvent === event);
                const proj = projectionByEvent.get(event);
                const flagged = flaggedByEvent.get(event);
                const points = planPointsByEvent.get(event) ?? 0;
                const baseline = baselineByEvent.get(event) ?? 0;
                const delta = Math.round((points - baseline) * 10) / 10;
                const hasContent = weekEntries.length > 0;
                return (
                  <li
                    key={event}
                    className={`rounded-lg border p-3 transition-colors duration-fast ease-standard ${
                      hasContent
                        ? "border-pl-purple/30 bg-pl-purple/5"
                        : flagged
                          ? "border-warning/40 bg-warning-bg/30"
                          : "border-border bg-surface-sunken/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-text-primary">GW{event}</span>
                        {flagged && (
                          <span
                            className="rounded-sm bg-warning-bg px-1.5 py-0.5 text-[10px] font-semibold text-warning"
                            title="Several of your squad have a thin fixture this week - see the advisor below"
                          >
                            {flagged.blankCount >= BLANK_THRESHOLD
                              ? `${flagged.blankCount} blank`
                              : `${flagged.doubleCount} double`}
                          </span>
                        )}
                        <span className="font-mono text-sm font-semibold text-text-primary">
                          {points.toFixed(1)} pts
                        </span>
                        {delta !== 0 && (
                          <span
                            className={`font-mono text-xs font-semibold ${delta > 0 ? "text-success" : "text-danger"}`}
                          >
                            {delta > 0 ? "+" : ""}
                            {delta.toFixed(1)} vs no plan
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                        <span>
                          <span className="font-mono font-medium text-text-primary">{proj?.freeAvailable ?? 0}</span>{" "}
                          free <InfoTooltip term="freeTransfers" />
                        </span>
                        {proj && proj.hitCount > 0 && (
                          <span className="font-mono font-semibold text-danger">
                            -{proj.hitPoints} hit <InfoTooltip term="transferHit" />
                          </span>
                        )}
                        <span>
                          bank{" "}
                          <span
                            className={`font-mono font-medium ${
                              proj && proj.bankAfter < 0 ? "text-danger" : "text-text-primary"
                            }`}
                          >
                            £{(proj?.bankAfter ?? bank).toFixed(1)}m
                          </span>
                        </span>
                      </div>
                    </div>

                    {hasContent && (
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {weekEntries.map((entry) => {
                          const original = squad.find((p) => p.live_id === entry.outLiveId);
                          const outgoing = original ? currentOccupantForGw(original, entries, entry.gwEvent - 1) : null;
                          const costDelta = outgoing ? entry.inPlayer.cost - outgoing.cost : 0;
                          return (
                            <li
                              key={entry.key}
                              className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-sm shadow-sm"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                <PlayerPhoto
                                  src={outgoing?.player_photo ?? ""}
                                  name={outgoing?.web_name ?? "?"}
                                  className="h-6 w-6 shrink-0 rounded-full border border-border-strong bg-surface-sunken object-cover object-top text-3xs"
                                />
                                <span className="truncate text-text-muted line-through decoration-danger/60">
                                  {outgoing?.web_name}
                                </span>
                                <span aria-hidden="true" className="shrink-0 text-text-muted">
                                  →
                                </span>
                                <PlayerPhoto
                                  src={entry.inPlayer.player_photo}
                                  name={entry.inPlayer.web_name}
                                  className="h-6 w-6 shrink-0 rounded-full border border-border-strong bg-surface-sunken object-cover object-top text-3xs"
                                />
                                <span className="truncate font-medium text-text-primary">{entry.inPlayer.web_name}</span>
                                <span className="shrink-0 font-mono text-[11px] text-text-muted">
                                  {costDelta >= 0 ? "+" : ""}
                                  £{costDelta.toFixed(1)}m
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => onRemove(entry.outLiveId, entry.gwEvent)}
                                className="shrink-0 text-xs font-semibold text-text-muted hover:text-danger"
                              >
                                Remove
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <button
                      type="button"
                      onClick={() => setChoosingSlotFor(event)}
                      disabled={addingKey != null}
                      className="mt-2 text-xs font-semibold text-pl-purple hover:underline disabled:cursor-wait disabled:opacity-60"
                    >
                      {addingKey != null && addingKey.endsWith(`:${event}`)
                        ? "Adding…"
                        : `+ Add a transfer for GW${event}`}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card padded={false}>
            <button
              type="button"
              onClick={() => setShowMatrix((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-text-primary hover:bg-surface-sunken/60"
            >
              Full points matrix, player by player
              <span className="text-xs font-medium text-text-muted">{showMatrix ? "▴ Hide" : "▾ Show"}</span>
            </button>
            {showMatrix && (
              <div className="overflow-x-auto border-t border-border">
                <table className="table-dense w-full text-left text-sm">
                  <thead className="bg-surface-sunken">
                    <tr>
                      <th className="sticky left-0 bg-surface-sunken px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                        Player
                      </th>
                      {planner.next_events.map((gw) => (
                        <th
                          key={gw}
                          className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-text-muted"
                        >
                          GW{gw}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slotRows.map((row) => (
                      <tr key={row.outLiveId} className="border-t border-border">
                        <td
                          className={`sticky left-0 whitespace-nowrap border-l-4 bg-white px-3 py-2 font-medium ${POSITION_BORDER[row.original.pos]}`}
                        >
                          <PlayerLink id={row.original.id} className="flex items-center gap-2">
                            <PlayerPhoto
                              src={row.original.player_photo}
                              name={row.original.web_name}
                              className="h-7 w-7 rounded-full border border-border-strong bg-surface-sunken object-cover object-top text-[8px]"
                            />
                            <span>
                              <span className="block">{row.original.web_name}</span>
                              <TeamBadge
                                teamShort={row.original.team_short}
                                name={row.original.team_short}
                                badgeUrl={row.original.team_badge}
                              />
                            </span>
                          </PlayerLink>
                        </td>
                        {row.cells.map((cell) => {
                          const hasBlank = cell.fixtureCount === 0;
                          const hasFlag = cell.flags.length > 0;
                          const bg = hasBlank ? "bg-danger-bg" : hasFlag ? "bg-warning-bg" : "";
                          const planTint = !cell.isOriginalOccupant ? "bg-pl-purple/5" : "";
                          return (
                            <td
                              key={cell.event}
                              className={`px-3 py-2 text-center font-mono ${bg || planTint} ${hasFlag ? "cursor-help" : ""} ${
                                cell.transferStartsHere ? "border-l-2 border-l-pl-purple" : ""
                              }`}
                              title={
                                cell.transferStartsHere
                                  ? `${cell.occupant.web_name} in from GW${cell.event}${
                                      cell.flags.length > 0 ? " · " + cell.flags.join(" · ") : ""
                                    }`
                                  : cell.flags.length > 0
                                    ? cell.flags.join(" · ")
                                    : undefined
                              }
                            >
                              {cell.predictedPoints != null ? cell.predictedPoints.toFixed(1) : "–"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <BlankGameweekAdvisor chips={chips} chipsLoading={chipsLoading} teamId={teamId} freeTransfers={freeTransfers} />
        </>
      )}

      {choosingSlotFor != null && (
        <SlotChooserModal
          squad={squad}
          entries={entries}
          gwEvent={choosingSlotFor}
          onPick={(original) => {
            const gwEvent = choosingSlotFor;
            setChoosingSlotFor(null);
            setInternalPickingFor({ gwEvent, original });
          }}
          onClose={() => setChoosingSlotFor(null)}
        />
      )}

      {pickingFor && planner && (
        <TransferPlanPicker
          pool={pool}
          poolLoading={poolLoading}
          outgoing={currentOccupantForGw(pickingFor.original, entries, pickingFor.gwEvent - 1)}
          gwEvent={pickingFor.gwEvent}
          maxCost={budgetForNewEntry({
            entries,
            squad,
            events: planner.next_events,
            startFreeTransfers: freeTransfers,
            startBank: bank,
            outLiveId: pickingFor.original.live_id as number,
            gwEvent: pickingFor.gwEvent,
          })}
          excludeIds={squad
            .filter((p) => p.live_id != null)
            .map((p) => currentOccupantForGw(p, entries, pickingFor.gwEvent).id)}
          onSelect={handlePick}
          onClose={closePicker}
        />
      )}
    </div>
  );
}
