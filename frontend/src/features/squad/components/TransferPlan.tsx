"use client";

import { useState } from "react";

import { Alert } from "@/shared/ui/Alert";
import { apiGet } from "@/shared/lib/api";
import type { PlanWeek, TransferPlan as TransferPlanResponse } from "@/shared/types/api";

/**
 * The transfer sequence, not just this week's move.
 *
 * Not to be confused with the Transfer Plan workspace, which is where a manager
 * builds their own sequence by hand - this is the one the solver would build.
 *
 * "Suggested transfers" answers what to do before this deadline, which is the
 * right question most weeks. This answers the other one: what the next few
 * weeks look like as a plan - which free transfer to roll, which week to take
 * a hit in, and what that hit is buying. A per-week optimiser cannot express
 * any of that, because the cost of a hit lands once and its benefit lands in
 * every week that follows.
 *
 * Loaded on demand. It is a single integer program over the whole window and
 * takes a few seconds; most visits to this page are not asking this question.
 */
export function TransferPlan({
  teamId,
  gwCount = 5,
  freeTransfers = 1,
}: {
  teamId: number;
  gwCount?: number;
  freeTransfers?: number;
}) {
  const [plan, setPlan] = useState<TransferPlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        gw_count: String(gwCount),
        free_transfers: String(freeTransfers),
      });
      setPlan(await apiGet<TransferPlanResponse>(`/api/squad/${teamId}/transfer-plan?${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
        Solved across all {gwCount} gameweeks at once rather than one at a time, so a free
        transfer can roll and a hit can be paid for by the weeks after it. Prices are current
        on both sides of a sale, and chips are not part of the plan - they have their own scan.
      </p>

      {!plan && !loading && (
        <button
          type="button"
          onClick={load}
          className="tap-target mt-3 rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-primary hover:border-border-strong"
        >
          Plan the next {gwCount} gameweeks
        </button>
      )}

      {loading && (
        <p className="mt-3 text-sm text-text-muted">
          Solving the whole window - one problem, five gameweeks. This takes a few seconds.
        </p>
      )}

      {error && <Alert kind="warning">Couldn&apos;t build a plan ({error}).</Alert>}

      {plan && (
        <>
          <p className="mt-3 text-sm text-text-secondary">
            <span className="font-mono font-semibold text-text-primary">
              {plan.total_predicted_points.toFixed(1)}
            </span>{" "}
            predicted points across GW{plan.events[0]}-{plan.events[plan.events.length - 1]}
            {plan.total_points_hit > 0 ? (
              <>
                , after <span className="font-mono text-danger">-{plan.total_points_hit}</span> in
                hits
              </>
            ) : (
              ", no hits taken"
            )}
            .
          </p>

          <ol className="mt-3 flex flex-col">
            {plan.weeks.map((week) => (
              <PlanRow key={week.event} week={week} />
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function PlanRow({ week }: { week: PlanWeek }) {
  const quiet = week.transfers_made === 0;
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 py-2.5 last:border-0">
      <span className="w-14 shrink-0 font-mono text-sm font-semibold text-text-primary">
        GW{week.event}
      </span>

      <span className="min-w-0 flex-1 text-sm">
        {quiet ? (
          <span className="text-text-muted">
            Roll the transfer{week.free_transfers > 1 ? `s (${week.free_transfers} banked)` : ""}
          </span>
        ) : (
          <>
            {week.transfers_out.map((out, i) => (
              <span key={out.id}>
                {i > 0 && <span className="text-text-muted"> · </span>}
                <span className="text-danger">↓ {out.web_name}</span>
                <span className="text-text-muted"> → </span>
                <span className="text-success">↑ {week.transfers_in[i]?.web_name}</span>
              </span>
            ))}
          </>
        )}
      </span>

      <span className="shrink-0 font-mono text-xs text-text-muted">
        {week.points_hit > 0 ? (
          <span className="text-danger">-{week.points_hit}</span>
        ) : (
          `${week.free_transfers} FT`
        )}
        {" · "}
        {week.predicted_points.toFixed(1)} pts
        {week.captain ? ` · (C) ${week.captain}` : ""}
      </span>
    </li>
  );
}
