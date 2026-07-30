import { Card } from "@/shared/ui/Card";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import type { ChipResponsePeriod } from "@/shared/types/api";

/**
 * One half's chip recommendation (Bench Boost/Triple Captain/Free Hit/
 * Wildcard) - each half of the season gets an entirely independent set of
 * chips (see fpl.model.rules.CHIP_RESET_EVENT), so these are never averaged
 * together across the reset.
 */
export function ChipPeriodCards({ period }: { period: ChipResponsePeriod }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {period.label}
        <span className="ml-1 font-normal normal-case text-text-muted">
          (GW{period.start_event}-{period.end_event})
        </span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Bench Boost <InfoTooltip term="benchBoost" />
          </p>
          <p className="mt-1 text-md font-bold text-pl-purple">GW{period.bench_boost.event}</p>
          <p className="mt-0.5 text-xs text-text-secondary">
            bench <span className="font-mono">{period.bench_boost.bench_score.toFixed(2)}</span> ·{" "}
            {period.bench_boost.double_count} DGW
          </p>
        </Card>
        <Card>
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Triple Captain <InfoTooltip term="tripleCaptain" />
          </p>
          <p className="mt-1 text-md font-bold text-pl-purple">GW{period.triple_captain.event}</p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {period.triple_captain.player} ·{" "}
            <span className="font-mono">{period.triple_captain.score.toFixed(2)}</span>
          </p>
        </Card>
        <Card>
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Free Hit <InfoTooltip term="freeHit" />
          </p>
          {period.free_hit.recommended ? (
            <>
              <p className="mt-1 text-md font-bold text-pl-purple">GW{period.free_hit.event}</p>
              <p className="mt-0.5 text-xs text-text-secondary">{period.free_hit.blank_count} of 15 blank</p>
            </>
          ) : (
            <p className="mt-1 text-xs text-text-secondary">No strong case - hold it</p>
          )}
        </Card>
        <Card>
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Wildcard <InfoTooltip term="wildcard" />
          </p>
          {period.wildcard ? (
            <>
              <p className="mt-1 text-md font-bold text-pl-purple">~GW{period.wildcard.suggested_event}</p>
              <p className="mt-0.5 text-xs text-text-secondary">{period.wildcard.reason}</p>
            </>
          ) : (
            <p className="mt-1 text-xs text-text-secondary">No major cluster found</p>
          )}
        </Card>
      </div>
    </div>
  );
}
