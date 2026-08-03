import type { ReactNode } from "react";
import { Card } from "@/shared/ui/Card";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import type { StatGlossaryKey } from "@/shared/lib/statGlossary";
import type { ChipResponsePeriod } from "@/shared/types/api";

/**
 * One chip's recommendation, as a verdict you can scan and a reason you can ask
 * for.
 *
 * These cards used to put the whole reasoning inline - "Hold it, at most 0 of 15
 * blank this window, not enough to be worth it. Save it for a run of
 * injuries/suspensions or a bigger blank gameweek." That's a paragraph in a stat
 * card, and four of them side by side is unreadable at any width. The decision is
 * "play it in GW17" or "hold"; the paragraph is why, which you only want when you
 * disagree with the verdict.
 */
function ChipCard({
  label,
  tooltip,
  verdict,
  detail,
  why,
  tone = "hold",
}: {
  label: string;
  tooltip: StatGlossaryKey;
  /** The decision, in as few characters as possible - a gameweek, or "Hold". */
  verdict: string;
  /** One short qualifier under the verdict. */
  detail?: ReactNode;
  /** The full reasoning, behind a disclosure. */
  why?: string;
  tone?: "play" | "hold";
}) {
  return (
    <Card>
      <p className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-text-muted">
        {label} <InfoTooltip term={tooltip} />
      </p>
      <p
        className={`mt-1 text-md font-bold ${tone === "play" ? "text-pl-purple" : "text-text-secondary"}`}
      >
        {verdict}
      </p>
      {detail && <p className="mt-0.5 text-xs text-text-secondary">{detail}</p>}
      {why && (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none text-2xs font-semibold uppercase tracking-wide text-pl-purple hover:underline">
            Why <span className="inline-block transition-transform group-open:rotate-90">›</span>
          </summary>
          <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{why}</p>
        </details>
      )}
    </Card>
  );
}

/**
 * One half's chip recommendation (Bench Boost/Triple Captain/Free Hit/
 * Wildcard) - each half of the season gets an entirely independent set of
 * chips (see fpl.model.rules.CHIP_RESET_EVENT), so these are never averaged
 * together across the reset.
 */
export function ChipPeriodCards({ period }: { period: ChipResponsePeriod }) {
  const { bench_boost: bb, triple_captain: tc, free_hit: fh, wildcard: wc } = period;

  return (
    <div className="@container/chips">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {period.label}
        <span className="ml-1 font-normal normal-case text-text-muted">
          (GW{period.start_event}-{period.end_event})
        </span>
      </p>
      {/* Column count follows this block's own width, not the window's.
          These cards render inside the Inspector, which was a 380-480px side
          column - so `lg:grid-cols-4` read "1280px window, go wide" and packed
          four 86px columns into it. Now that each card is a verdict rather than a
          paragraph, two across reads comfortably from 30rem. */}
      <div className="grid gap-3 @[30rem]/chips:grid-cols-2 @[54rem]/chips:grid-cols-4">
        <ChipCard
          label="Bench Boost"
          tooltip="benchBoost"
          tone="play"
          verdict={`GW${bb.event}`}
          detail={
            <>
              bench <span className="font-mono">{bb.bench_score.toFixed(3)}</span>
              {bb.double_count > 0 ? ` · ${bb.double_count} DGW` : " · no DGW"}
            </>
          }
        />

        <ChipCard
          label="Triple Captain"
          tooltip="tripleCaptain"
          tone="play"
          verdict={`GW${tc.event}`}
          detail={
            <>
              {tc.player} · <span className="font-mono">{tc.score.toFixed(2)}</span>
            </>
          }
        />

        {fh.recommended ? (
          <ChipCard
            label="Free Hit"
            tooltip="freeHit"
            tone="play"
            verdict={`GW${fh.event}`}
            detail={`${fh.blank_count} of 15 blank`}
          />
        ) : (
          <ChipCard
            label="Free Hit"
            tooltip="freeHit"
            verdict="Hold"
            detail={`only ${fh.blank_count} of 15 blank`}
            why="Not enough of your squad blanks in this window to be worth the chip. Save it for a run of injuries and suspensions, or a bigger blank gameweek later."
          />
        )}

        {wc ? (
          <ChipCard
            label="Wildcard"
            tooltip="wildcard"
            tone="play"
            verdict={`~GW${wc.suggested_event}`}
            why={wc.reason}
          />
        ) : (
          <ChipCard
            label="Wildcard"
            tooltip="wildcard"
            verdict="Hold"
            detail="no cluster worth it"
            why="No run of blank or double gameweeks in this window is worth rebuilding around yet. Wait for fixtures to congest, or for your squad to need a bigger overhaul than a couple of transfers."
          />
        )}
      </div>
    </div>
  );
}
