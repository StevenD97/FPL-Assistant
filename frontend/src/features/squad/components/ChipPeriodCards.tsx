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
    <div className="@container/chips">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {period.label}
        <span className="ml-1 font-normal normal-case text-text-muted">
          (GW{period.start_event}-{period.end_event})
        </span>
      </p>
      {/* Column count follows this block's own width, not the window's.
          These cards render inside the Inspector, which is a ~420px side column
          on desktop - so `lg:grid-cols-4` was reading "1280px window, go wide"
          and packing four 86px columns into it. Two of these cards hold a full
          sentence of reasoning, which at 86px wraps to one word per line.
          Thresholds are set on what the content needs: ~190px minimum for a card
          with prose in it, so 2 columns from 26rem and 4 only past 52rem. */}
      <div className="grid gap-3 @[26rem]/chips:grid-cols-2 @[52rem]/chips:grid-cols-4">
        <Card>
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Bench Boost <InfoTooltip term="benchBoost" />
          </p>
          <p className="mt-1 text-md font-bold text-pl-purple">GW{period.bench_boost.event}</p>
          <p className="mt-0.5 text-xs text-text-secondary">
            bench <span className="font-mono">{period.bench_boost.bench_score.toFixed(3)}</span> ·{" "}
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
            <p className="mt-1 text-xs text-text-secondary">
              Hold it - at most {period.free_hit.blank_count} of 15 blank this window, not enough to be worth
              it. Save it for a run of injuries/suspensions or a bigger blank gameweek.
            </p>
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
            <p className="mt-1 text-xs text-text-secondary">
              Hold it - no cluster of blank/double gameweeks in this window worth rebuilding around yet. Wait
              for fixtures to congest, or for your squad to need a bigger overhaul than a couple of transfers.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
