"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/shared/ui/Alert";
import { Card } from "@/shared/ui/Card";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { Skeleton } from "@/shared/ui/Skeleton";
import { StatBar } from "@/shared/ui/StatBar";
import { TextField } from "@/shared/ui/TextField";
import { getPlayerPool } from "@/shared/api/squad";
import { BlankGameweekAdvisor, findFlaggedWeeks } from "./components/BlankGameweekAdvisor";
import { PlanGameweekBar, planTabId, type PlanWeekSummary } from "./components/PlanGameweekBar";
import { PlanPitch } from "./components/PlanPitch";
import { PlanSquadTable } from "./components/PlanSquadTable";
import { TransferPlanPicker } from "./components/TransferPlanPicker";
import { useLoadedSquad } from "./hooks/useLoadedSquad";
import { useTransferPlan } from "./hooks/useTransferPlan";
import {
  budgetForNewEntry,
  buildSlotRows,
  computeWeeklyProjection,
  currentOccupantForGw,
} from "./lib/transferPlan";
import type { PoolPlayer } from "@/shared/types/api";

/** The one panel every gameweek tab drives - see PlanGameweekBar. */
const PLAN_PANEL_ID = "transfer-plan-gameweek-panel";

/**
 * The connected team's transfer plan - promoted out of the Inspector rail
 * into its own workspace, because planning ahead is a thing you *do*, not a
 * readout you glance at.
 *
 * The shape is a gameweek bar over a pitch over a table: pick a week, see
 * the team you'd actually field that week with every planned transfer up to
 * it applied, and swap anyone by tapping them. Plans persist as you step
 * between weeks, so building "GW15 Watkins out, GW17 Kelleher out" is a
 * matter of walking forward through the bar rather than filling in a form.
 */
export function TransferPlanWorkspace({ teamId, teamName }: { teamId: number; teamName: string }) {
  const [freeTransfers, setFreeTransfers] = useState(1);
  const { squad: squadRes, optimizer: optimizerRes, planner: plannerRes, chips: chipsRes, load } = useLoadedSquad();

  useEffect(() => {
    load(String(teamId), freeTransfers);
    // Reload on the team changing, not on every keystroke in the free-transfers
    // field - applyFreeTransfers reloads explicitly when that value settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const { data, loading, error } = squadRes;
  const { data: optimizer, loading: optimizerLoading } = optimizerRes;
  const { data: planner } = plannerRes;
  const { data: chips, loading: chipsLoading } = chipsRes;

  const events = useMemo(() => planner?.next_events ?? [], [planner]);
  const planWindowEnd = events.length > 0 ? events[events.length - 1] : null;
  const { entries, addingKey, error: planError, addEntry, removeEntry, clearAll } = useTransferPlan(planWindowEnd);

  // Null until the reader picks one, so the default can follow the planner
  // arriving without an effect writing state on load.
  const [pickedGw, setPickedGw] = useState<number | null>(null);
  const selectedGw = pickedGw != null && events.includes(pickedGw) ? pickedGw : (events[0] ?? 0);

  const [pickingFor, setPickingFor] = useState<{ gwEvent: number; outLiveId: number } | null>(null);

  const [pool, setPool] = useState<PoolPlayer[] | null>(null);
  const [poolLoading, setPoolLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getPlayerPool()
      .then((rows) => {
        if (!cancelled) setPool(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPoolLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const slotRows = useMemo(
    () => (planner && data ? buildSlotRows(data.squad, planner, entries) : []),
    [planner, data, entries],
  );
  const projections = useMemo(
    () => (planner && data ? computeWeeklyProjection(entries, data.squad, events, freeTransfers, data.bank) : []),
    [planner, data, entries, events, freeTransfers],
  );
  const projectionByEvent = useMemo(() => new Map(projections.map((p) => [p.event, p])), [projections]);

  // The same window with no plan at all - what each week's delta is measured
  // against, so "+1.2" means "better than doing nothing", not "better than
  // last week".
  const baselineByEvent = useMemo(() => {
    const map = new Map<number, number>();
    if (!planner) return map;
    for (const event of events) {
      let total = 0;
      for (const p of planner.players) {
        const row = p.trajectory.find((t) => t.event === event);
        if (row) total += row.predicted_points;
      }
      map.set(event, total);
    }
    return map;
  }, [planner, events]);

  const flaggedByEvent = useMemo(() => {
    const map = new Map<number, { blankCount: number; doubleCount: number }>();
    if (!chips) return map;
    for (const week of findFlaggedWeeks(chips)) map.set(week.event, week);
    return map;
  }, [chips]);

  const weeks: PlanWeekSummary[] = useMemo(
    () =>
      events.map((event) => {
        const points = slotRows.reduce((sum, row) => {
          const cell = row.cells.find((c) => c.event === event);
          return sum + (cell?.predictedPoints ?? 0);
        }, 0);
        return {
          event,
          points,
          delta: Math.round((points - (baselineByEvent.get(event) ?? 0)) * 10) / 10,
          projection: projectionByEvent.get(event),
          flagged: flaggedByEvent.get(event),
        };
      }),
    [events, slotRows, baselineByEvent, projectionByEvent, flaggedByEvent],
  );

  const selectedProjection = projectionByEvent.get(selectedGw);
  const selectedEntries = entries.filter((e) => e.gwEvent === selectedGw);

  function applyFreeTransfers(raw: string) {
    const value = Math.max(0, Math.min(5, Number(raw)));
    setFreeTransfers(value);
    load(String(teamId), value);
  }

  // The optimizer result useLoadedSquad already fetches is exactly "what
  // would the model do right now" - reusing it means the headline
  // recommendation costs no extra request and can't disagree with the
  // Suggested transfers read elsewhere in the app.
  function addRecommended(outId: number, inId: number, targetGw: number) {
    if (!data || !pool) return;
    const original = data.squad.find((p) => p.live_id === outId);
    const candidate = pool.find((p) => p.id === inId);
    if (original?.live_id == null || !candidate) return;
    addEntry(original.live_id, targetGw, candidate);
  }

  function handlePick(candidate: PoolPlayer) {
    if (!pickingFor) return;
    const { outLiveId, gwEvent } = pickingFor;
    setPickingFor(null);
    addEntry(outLiveId, gwEvent, candidate);
  }

  const pickingOriginal =
    pickingFor && data ? data.squad.find((p) => p.live_id === pickingFor.outLiveId) : undefined;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{teamName}</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Step through the gameweeks below. Each one shows the team you&apos;d field that week with your
            planned transfers applied - tap any player to swap them for that week onwards.
          </p>
        </div>
        <TextField
          label="Free transfers"
          hint="freeTransfers"
          type="number"
          min={0}
          max={5}
          value={freeTransfers}
          onChange={(e) => applyFreeTransfers(e.target.value)}
          wrapperClassName="w-32"
        />
      </div>

      {error && (
        <p className="mb-4 text-sm font-medium text-danger">
          {error} - no picks yet for this team? Try building a squad from scratch instead.
        </p>
      )}

      {loading && !data && (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-[480px] w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <StatBar
            items={[
              {
                label: "In the bank",
                value: `£${data.bank}m`,
                hint: "before anything planned below",
                tooltip: "bankLeft",
              },
              {
                label: "Squad value",
                value: `£${data.squad_value}m`,
                hint: `${data.squad.length} players`,
                tooltip: "squadValue",
              },
              {
                label: "Transfers planned",
                value: entries.length,
                hint:
                  entries.length > 0
                    ? `GW${Math.min(...entries.map((e) => e.gwEvent))}-${Math.max(...entries.map((e) => e.gwEvent))}`
                    : "none yet",
              },
              {
                label: "Planning window",
                value: events.length > 0 ? `GW${events[0]}-${planWindowEnd}` : "-",
                hint: "how far ahead this page looks",
                tooltip: "window",
              },
            ]}
          />

          {/* Proactive, not on-request: the data already exists server-side,
              so the model's own pick for right now is simply here. */}
          {optimizer && optimizer.transferred_out.length > 0 && (
            <Card className="border-pl-purple/25 bg-pl-purple/[0.03]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-text-primary">Recommended right now</h3>
                <span className="text-xs text-text-muted">
                  <span className="font-mono font-medium text-text-primary">{optimizer.transfers_made}</span>{" "}
                  transfer{optimizer.transfers_made === 1 ? "" : "s"} ·{" "}
                  {optimizer.points_hit > 0 ? (
                    <span className="font-mono text-danger">-{optimizer.points_hit} pt hit</span>
                  ) : (
                    "no hit"
                  )}{" "}
                  <InfoTooltip term="transferHit" />
                </span>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {optimizer.transferred_out.map((outP, i) => {
                  const inP = optimizer.transferred_in[i];
                  if (!inP) return null;
                  const original = data.squad.find((p) => p.live_id === outP.id);
                  const targetGw = optimizer.next_event;
                  const already =
                    original?.live_id != null &&
                    entries.some((e) => e.outLiveId === original.live_id && e.gwEvent === targetGw);
                  return (
                    <li
                      key={outP.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <PlayerPhoto
                          src={outP.player_photo}
                          name={outP.web_name}
                          className="h-7 w-7 shrink-0 rounded-full border border-border-strong bg-surface-sunken object-cover object-top text-3xs"
                        />
                        <span className="truncate text-text-muted line-through decoration-danger/60">
                          {outP.web_name}
                        </span>
                        <span aria-hidden="true" className="text-text-muted">
                          →
                        </span>
                        <PlayerPhoto
                          src={inP.player_photo}
                          name={inP.web_name}
                          className="h-7 w-7 shrink-0 rounded-full border border-border-strong bg-surface-sunken object-cover object-top text-3xs"
                        />
                        <span className="truncate font-medium text-text-primary">{inP.web_name}</span>
                      </div>
                      <button
                        type="button"
                        disabled={already || original?.live_id == null || !pool}
                        onClick={() => addRecommended(outP.id, inP.id, targetGw)}
                        className="shrink-0 rounded-md border border-pl-purple/40 px-2.5 py-1 text-xs font-semibold text-pl-purple hover:bg-pl-purple/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {already ? "Added ✓" : `+ Add to GW${targetGw}`}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {optimizerLoading && !optimizer && (
            <p className="text-sm text-text-muted">Solving your best transfer…</p>
          )}

          {planner && events.length > 0 ? (
            <>
              <PlanGameweekBar
                weeks={weeks}
                selected={selectedGw}
                onSelect={setPickedGw}
                panelId={PLAN_PANEL_ID}
              />

              <Card padded={false} id={PLAN_PANEL_ID} role="tabpanel" aria-labelledby={planTabId(selectedGw)}>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border p-4">
                  <div>
                    <h3 className="font-semibold text-text-primary">Your team in GW{selectedGw}</h3>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Tap a player to plan a transfer from this gameweek onwards.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
                    <span>
                      <span className="font-mono font-medium text-text-primary">
                        {(weeks.find((w) => w.event === selectedGw)?.points ?? 0).toFixed(1)}
                      </span>{" "}
                      pts
                    </span>
                    <span>
                      <span className="font-mono font-medium text-text-primary">
                        {selectedProjection?.freeAvailable ?? 0}
                      </span>{" "}
                      free <InfoTooltip term="freeTransfers" />
                    </span>
                    {selectedProjection && selectedProjection.hitPoints > 0 && (
                      <span className="font-mono font-semibold text-danger">
                        -{selectedProjection.hitPoints} hit
                      </span>
                    )}
                    <span>
                      bank{" "}
                      <span
                        className={`font-mono font-medium ${
                          selectedProjection && selectedProjection.bankAfter < 0
                            ? "text-danger"
                            : "text-text-primary"
                        }`}
                      >
                        £{(selectedProjection?.bankAfter ?? data.bank).toFixed(1)}m
                      </span>
                    </span>
                    {entries.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAll}
                        className="font-semibold text-pl-purple hover:underline"
                      >
                        Clear plan ({entries.length})
                      </button>
                    )}
                  </div>
                </div>

                {planError && (
                  <div className="p-4 pb-0">
                    <Alert kind="warning">{planError}</Alert>
                  </div>
                )}
                {addingKey != null && (
                  <p className="px-4 pt-3 text-xs text-text-muted">Adding transfer…</p>
                )}

                <div className="p-4">
                  <PlanPitch
                    slotRows={slotRows}
                    event={selectedGw}
                    onPlanTransfer={(outLiveId) => setPickingFor({ gwEvent: selectedGw, outLiveId })}
                  />

                  {selectedEntries.length > 0 && (
                    <ul className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3">
                      {selectedEntries.map((entry) => {
                        const original = data.squad.find((p) => p.live_id === entry.outLiveId);
                        const outgoing = original
                          ? currentOccupantForGw(original, entries, entry.gwEvent - 1)
                          : null;
                        const costDelta = outgoing ? entry.inPlayer.cost - outgoing.cost : 0;
                        return (
                          <li
                            key={entry.key}
                            className="flex items-center justify-between gap-2 rounded-md border border-pl-purple/25 bg-pl-purple/5 px-2 py-1.5 text-sm"
                          >
                            <span className="flex min-w-0 flex-1 items-center gap-1.5">
                              <span className="shrink-0 text-2xs font-bold uppercase tracking-wide text-pl-purple">
                                Planned
                              </span>
                              <span className="truncate text-text-muted line-through decoration-danger/60">
                                {outgoing?.web_name}
                              </span>
                              <span aria-hidden="true" className="shrink-0 text-text-muted">
                                →
                              </span>
                              <span className="truncate font-medium text-text-primary">
                                {entry.inPlayer.web_name}
                              </span>
                              <span className="shrink-0 font-mono text-[11px] text-text-muted">
                                {costDelta >= 0 ? "+" : ""}
                                £{costDelta.toFixed(1)}m
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => removeEntry(entry.outLiveId, entry.gwEvent)}
                              className="shrink-0 text-xs font-semibold text-text-muted hover:text-danger"
                            >
                              Remove
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </Card>

              <PlanSquadTable
                slotRows={slotRows}
                events={events}
                projections={projections}
                selectedEvent={selectedGw}
                onSelectEvent={setPickedGw}
              />
            </>
          ) : (
            <p className="text-sm text-text-muted">Building your outlook…</p>
          )}

          <BlankGameweekAdvisor
            chips={chips}
            chipsLoading={chipsLoading}
            teamId={String(teamId)}
            freeTransfers={freeTransfers}
          />
        </div>
      )}

      {pickingFor && pickingOriginal && data && planner && (
        <TransferPlanPicker
          pool={pool}
          poolLoading={poolLoading}
          outgoing={currentOccupantForGw(pickingOriginal, entries, pickingFor.gwEvent - 1)}
          gwEvent={pickingFor.gwEvent}
          replacingPlanned={
            entries.find((e) => e.outLiveId === pickingFor.outLiveId && e.gwEvent === pickingFor.gwEvent)
              ?.inPlayer.web_name
          }
          maxCost={budgetForNewEntry({
            entries,
            squad: data.squad,
            events,
            startFreeTransfers: freeTransfers,
            startBank: data.bank,
            outLiveId: pickingFor.outLiveId,
            gwEvent: pickingFor.gwEvent,
          })}
          excludeIds={data.squad
            .filter((p) => p.live_id != null)
            .map((p) => currentOccupantForGw(p, entries, pickingFor.gwEvent).id)}
          onSelect={handlePick}
          onClose={() => setPickingFor(null)}
        />
      )}
    </div>
  );
}
