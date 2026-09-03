"use client";

import type { CaptaincyOption, TransferResult } from "@/shared/types/api";

/**
 * The one thing to do this week, and why.
 *
 * The squad page opened with a team sheet and a list of eight equally-weighted
 * "reads" - transfers, captaincy, chips, fixtures, differentials, strength,
 * detail, setup - each a summary line behind a chevron. Everything was there
 * and nothing was the answer. A manager arriving with two minutes before a
 * deadline had to open three of them and do the comparison themselves, which
 * is the work they came here to have done.
 *
 * This states the recommendation first, in a sentence, with the numbers behind
 * it visible. The reads stay exactly where they were, underneath: the summary
 * is for deciding, the reads are for disagreeing.
 */
export function ThisWeek({
  optimizer,
  optimizerLoading,
  topCaptain,
  currentCaptainName,
  nextEvent,
  onOpenTransfers,
  onOpenCaptaincy,
}: {
  optimizer: TransferResult | null;
  optimizerLoading: boolean;
  topCaptain: CaptaincyOption | null;
  currentCaptainName: string | null;
  nextEvent: number | null;
  onOpenTransfers: () => void;
  onOpenCaptaincy: () => void;
}) {
  const swap =
    optimizer && optimizer.transferred_in.length > 0
      ? { in: optimizer.transferred_in[0], out: optimizer.transferred_out[0] }
      : null;
  const captainMatches = topCaptain != null && topCaptain.web_name === currentCaptainName;

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-text-muted">
        {nextEvent != null ? `Before the GW${nextEvent} deadline` : "Before the deadline"}
      </h2>

      <div className="mt-2 flex flex-col gap-3">
        <Action
          kind="Transfer"
          onOpen={onOpenTransfers}
          headline={
            optimizerLoading
              ? "Working out your best move…"
              : swap
                ? `${swap.out.web_name} → ${swap.in.web_name}`
                : "No transfer worth making"
          }
          reason={
            optimizerLoading
              ? null
              : swap
                ? swap.in.reason
                : "Every free transfer the model can see leaves you worse off than standing still."
          }
          extra={
            swap && optimizer && optimizer.transfers_made > 1
              ? `+${optimizer.transfers_made - 1} more suggested`
              : null
          }
        />

        <Action
          kind="Captain"
          onOpen={onOpenCaptaincy}
          headline={
            topCaptain
              ? captainMatches
                ? `Keep ${topCaptain.web_name}`
                : `${topCaptain.web_name}, not ${currentCaptainName ?? "your current pick"}`
              : "No captaincy read yet"
          }
          reason={topCaptain?.reason ?? null}
        />
      </div>
    </section>
  );
}

function Action({
  kind,
  headline,
  reason,
  extra,
  onOpen,
}: {
  kind: string;
  headline: string;
  reason: string | null;
  extra?: string | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="tap-target flex w-full items-start gap-3 rounded-md border border-transparent p-1 text-left transition-colors hover:border-border hover:bg-surface-sunken"
    >
      <span className="mt-0.5 w-16 shrink-0 text-xs font-bold uppercase tracking-[0.08em] text-text-muted">
        {kind}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-md font-semibold text-text-primary">{headline}</span>
        {reason && <span className="mt-0.5 block text-sm leading-snug text-text-secondary">{reason}</span>}
        {extra && <span className="mt-0.5 block text-xs text-text-muted">{extra}</span>}
      </span>
      <span aria-hidden="true" className="mt-1 shrink-0 text-text-muted">
        ›
      </span>
    </button>
  );
}
