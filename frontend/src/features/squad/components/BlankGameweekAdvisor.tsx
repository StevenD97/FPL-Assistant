"use client";

import { useState } from "react";
import { Alert } from "@/shared/ui/Alert";
import { Card } from "@/shared/ui/Card";
import { Pending } from "@/shared/ui/Pending";
import { optimizeTransfers } from "@/shared/api/squad";
import { TransferPlayerRow } from "./TransferPlayerRow";
import type { ChipResponse, TransferResult } from "@/shared/types/api";

// Below this, a blank/double isn't worth rebuilding a squad around - the
// same order of magnitude Free Hit's own "worth playing" cutoff uses
// (fpl.services.chips), so the two reads agree on what "several" means.
// Exported so the plan board can flag the same gameweeks in its own timeline
// without re-deriving the cutoff.
export const BLANK_THRESHOLD = 3;
export const DOUBLE_THRESHOLD = 3;

export type FlaggedWeek = { event: number; blankCount: number; doubleCount: number };

export function findFlaggedWeeks(chips: ChipResponse): FlaggedWeek[] {
  return chips.table
    .filter((row) => row.blank_count >= BLANK_THRESHOLD || row.double_count >= DOUBLE_THRESHOLD)
    .map((row) => ({ event: row.event, blankCount: row.blank_count, doubleCount: row.double_count }))
    .sort((a, b) => a.event - b.event);
}

/**
 * "There's a blank gameweek coming - what do I do about it?"
 *
 * The chip-timing scan already looks 15 gameweeks ahead for exactly this
 * (it's what Free Hit/Wildcard use to spot a cluster worth planning
 * around) - this reads the same `chips.table` rather than re-deriving
 * blank/double counts, so the two reads can't disagree with each other.
 *
 * "Plan for GW23" re-runs the same optimizer Suggested transfers uses, just
 * pointed at a window that reaches the target gameweek instead of stopping
 * a few weeks short - it naturally prices in anyone who'd blank that week,
 * since their predicted points for it are ~0. No separate multi-period
 * solver; the existing one already answers this once it's asked the
 * question over the right span.
 */
export function BlankGameweekAdvisor({
  chips,
  chipsLoading,
  teamId,
  freeTransfers,
}: {
  chips: ChipResponse | null;
  chipsLoading: boolean;
  teamId: string;
  freeTransfers: number;
}) {
  const [planFor, setPlanFor] = useState<number | null>(null);
  const [plan, setPlan] = useState<TransferResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function planForWeek(targetEvent: number, nextEvent: number) {
    setPlanFor(targetEvent);
    setPlan(null);
    setError(null);
    setLoading(true);
    try {
      const result = await optimizeTransfers(teamId, {
        free_transfers: freeTransfers,
        next_event: nextEvent,
        gw_count: Math.max(1, targetEvent - nextEvent + 1),
      });
      setPlan(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't compute a plan");
    } finally {
      setLoading(false);
    }
  }

  if (chipsLoading) return <Pending label="Scanning ahead for blanks and doubles…" />;
  if (!chips) return null;

  const nextEvent = chips.scan_start_event;
  const flagged = findFlaggedWeeks(chips);

  return (
    <Card className="mb-4">
      <h3 className="font-semibold text-text-primary">Need a starting point? Blank &amp; double gameweeks ahead</h3>
      <p className="mt-1 text-xs text-text-muted">
        Scanned GW{chips.scan_start_event}-{chips.scan_end_event - 1}{" "}
        for gameweeks where several of your squad have no fixture (blank) or two (double) - further out than
        the plan above goes. The model&apos;s own transfer picks for reaching one, as a starting point for your
        own version above.
      </p>

      {flagged.length === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">
          Nothing flagged in this window - no blank or double gameweek affects enough of your squad to plan
          around yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {flagged.map((week) => (
            <li
              key={week.event}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-sunken px-3 py-2"
            >
              <span className="text-sm">
                <span className="font-mono font-semibold text-text-primary">GW{week.event}</span>{" "}
                {week.blankCount >= BLANK_THRESHOLD && (
                  <span className="text-danger">{week.blankCount} of 15 blank</span>
                )}
                {week.blankCount >= BLANK_THRESHOLD && week.doubleCount >= DOUBLE_THRESHOLD && " · "}
                {week.doubleCount >= DOUBLE_THRESHOLD && (
                  <span className="text-success">{week.doubleCount} of 15 double up</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => planForWeek(week.event, nextEvent)}
                className="rounded-md border border-brand/40 px-2.5 py-1 text-xs font-semibold text-brand hover:bg-ink-900/10"
              >
                Plan for GW{week.event}
              </button>
            </li>
          ))}
        </ul>
      )}

      {planFor != null && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Preparing for GW{planFor}
          </p>
          {loading && (
            <p className="text-sm text-text-muted">
              Solving across GW{nextEvent}-{planFor}...
            </p>
          )}
          {error && <Alert kind="warning">Couldn&apos;t compute a plan ({error}).</Alert>}
          {plan && (
            <>
              <p className="mb-2 text-sm text-text-secondary">
                <span className="font-mono font-medium text-text-primary">{plan.transfers_made}</span> transfer
                {plan.transfers_made === 1 ? "" : "s"}
                {" · "}
                {plan.points_hit > 0 ? (
                  <span className="font-mono text-danger">-{plan.points_hit} pt hit</span>
                ) : (
                  "no hit"
                )}
                {" · "}
                predicted XI points, GW{nextEvent}
                {planFor > nextEvent ? `-${planFor}` : ""} combined (after hit){" "}
                <span className="font-mono font-medium text-text-primary">{plan.predicted_points.toFixed(2)}</span>
              </p>
              {plan.transferred_out.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">Out</p>
                    <ul className="flex flex-col gap-1.5">
                      {plan.transferred_out.map((p) => (
                        <TransferPlayerRow key={p.id} p={p} tone="out" />
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">In</p>
                    <ul className="flex flex-col gap-1.5">
                      {plan.transferred_in.map((p) => (
                        <TransferPlayerRow key={p.id} p={p} tone="in" />
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <Alert kind="success">
                  No changes needed - your squad is already well-placed for GW{planFor}.
                </Alert>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
