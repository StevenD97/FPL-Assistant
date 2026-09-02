"use client";

import { useState } from "react";
import { Alert } from "@/shared/ui/Alert";
import { Card } from "@/shared/ui/Card";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { optimizeTransfers } from "@/shared/api/squad";
import { TransferPlayerRow } from "./TransferPlayerRow";
import type { TransferResult } from "@/shared/types/api";

/**
 * The optimizer's recommendation for an already-loaded squad. Errors render
 * here rather than at page level on purpose: a failure (e.g. FPL having purged
 * this manager's pick history at a season boundary) leaves the squad above
 * perfectly usable.
 *
 * The optimizer picks its own transfer count by default (0 is a valid,
 * sometimes-optimal answer) - the "Transfers" field lets you override that and
 * force a specific count, e.g. "show me the best 3 transfers" even when the
 * solver's own free choice is fewer.
 */
export function SuggestedTransfers({
  optimizer,
  loading,
  error,
  teamId,
  freeTransfers,
}: {
  optimizer: TransferResult | null;
  loading: boolean;
  error: string | null;
  teamId: string;
  freeTransfers: number;
}) {
  const [transferCount, setTransferCount] = useState<number | "">("");
  const [override, setOverride] = useState<TransferResult | null>(null);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  async function applyTransferCount(raw: string) {
    if (raw === "") {
      setTransferCount("");
      setOverride(null);
      setOverrideError(null);
      return;
    }
    const value = Math.max(0, Math.min(15, Number(raw)));
    setTransferCount(value);
    if (!teamId) return;
    setOverrideLoading(true);
    setOverrideError(null);
    try {
      const result = await optimizeTransfers(teamId, { free_transfers: freeTransfers, transfers: value });
      setOverride(result);
    } catch (e) {
      setOverrideError(e instanceof Error ? e.message : "Couldn't compute that");
      setOverride(null);
    } finally {
      setOverrideLoading(false);
    }
  }

  const isOverride = transferCount !== "";
  const shown = isOverride ? override : optimizer;
  const shownLoading = isOverride ? overrideLoading : loading;
  const shownError = isOverride ? overrideError : error;

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-text-primary">Suggested transfers</h3>
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          Transfers
          <input
            type="number"
            min={0}
            max={15}
            placeholder="Auto"
            value={transferCount}
            onChange={(e) => applyTransferCount(e.target.value)}
            className="w-16 rounded-md border border-border px-2 py-1 text-sm text-text-primary"
          />
          {isOverride && (
            <button
              type="button"
              onClick={() => applyTransferCount("")}
              className="text-pl-purple underline"
            >
              Reset to auto
            </button>
          )}
        </label>
      </div>
      <p className="mb-3 text-xs text-text-muted">
        {isOverride
          ? "Forced to this many transfers - not necessarily the optimizer's own free choice."
          : "The optimal transfers for your squad and bank, weighing predicted points against the -4 hit per transfer beyond your free ones."}
      </p>

      {shownLoading && (
        <p className="text-sm text-text-muted">Solving...</p>
      )}

      {shownError && (
        <Alert kind="warning">
          Couldn&apos;t compute suggested transfers ({shownError}) - the squad
          above is unaffected.
        </Alert>
      )}

      {shown && (
        <>
          <p className="mb-3 text-sm text-text-secondary">
            <span className="font-mono font-medium text-text-primary">{shown.transfers_made}</span>{" "}
            transfer{shown.transfers_made === 1 ? "" : "s"}
            {" · "}
            {shown.points_hit > 0 ? (
              <span className="inline-flex items-center gap-1 font-mono text-danger">
                -{shown.points_hit} pt hit <InfoTooltip term="transferHit" />
              </span>
            ) : (
              <span>no hit</span>
            )}
            {" · "}
            predicted XI points, GW{shown.next_event}
            {shown.gw_count > 1 ? `-${shown.next_event + shown.gw_count - 1}` : ""} combined (after hit){" "}
            <span className="font-mono font-medium text-text-primary">
              {shown.predicted_points.toFixed(2)}
            </span>{" "}
            <InfoTooltip term="predictedXiWindow" />
          </p>

          {/* Why, before who. The two columns below say what the optimiser
              decided; these sentences say what decided it - the points
              difference, the fixtures behind it, an availability flag, what it
              does to the bank. Without them the page asserts a swap and the
              reader has to take it on faith. */}
          {shown.transferred_in.some((p) => p.reason) && (
            <ul className="mb-3 flex flex-col gap-1.5">
              {shown.transferred_in.map((p) => (
                <li key={`why-${p.id}`} className="text-sm leading-snug text-text-secondary">
                  {p.reason}
                </li>
              ))}
            </ul>
          )}

          {shown.transferred_out.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                  Out
                </p>
                <ul className="flex flex-col gap-1.5">
                  {shown.transferred_out.map((p) => (
                    <TransferPlayerRow key={p.id} p={p} tone="out" />
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                  In
                </p>
                <ul className="flex flex-col gap-1.5">
                  {shown.transferred_in.map((p) => (
                    <TransferPlayerRow key={p.id} p={p} tone="in" />
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <Alert kind="success">
              No changes recommended - your squad is already optimal for this window.
            </Alert>
          )}
        </>
      )}
    </Card>
  );
}
