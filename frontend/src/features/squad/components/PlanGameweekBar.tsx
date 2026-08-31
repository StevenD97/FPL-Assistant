"use client";

import type { WeeklyProjection } from "../lib/transferPlan";

export type PlanWeekSummary = {
  event: number;
  /** Squad predicted points that week, under the plan. */
  points: number;
  /** Against the same week with no plan at all - the reason to have made these moves. */
  delta: number;
  projection: WeeklyProjection | undefined;
  flagged: { blankCount: number; doubleCount: number } | undefined;
};

/**
 * The spine of the plan: pick a gameweek here and everything below shows
 * that week - who's in the squad by then, who they play, what it costs.
 *
 * Deliberately a run of tiles rather than a dropdown or a slider: the whole
 * point is comparing weeks at a glance (which one dips, which one carries a
 * hit, which one has a blank) and then stepping into the one that looks
 * wrong, which a control showing one value at a time can't support.
 */
/** Stable per-gameweek tab id, so the panel below can name the tab describing it. */
export function planTabId(event: number): string {
  return `plan-gw-tab-${event}`;
}

export function PlanGameweekBar({
  weeks,
  selected,
  onSelect,
  panelId,
}: {
  weeks: PlanWeekSummary[];
  selected: number;
  onSelect: (event: number) => void;
  /** The pitch panel these tabs drive. */
  panelId: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Gameweek"
      className="flex gap-2 overflow-x-auto pb-1"
    >
      {weeks.map((w) => {
        const isSelected = w.event === selected;
        const transfers = w.projection?.transfersMade ?? 0;
        const hit = w.projection?.hitPoints ?? 0;
        return (
          <button
            key={w.event}
            type="button"
            role="tab"
            id={planTabId(w.event)}
            aria-selected={isSelected}
            aria-controls={panelId}
            onClick={() => onSelect(w.event)}
            className={`flex min-w-[7rem] flex-1 flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 transition-colors duration-fast ease-standard ${
              isSelected
                ? "border-pl-purple bg-pl-purple text-white shadow-sm"
                : "border-border bg-white hover:border-pl-purple/40"
            }`}
          >
            <span
              className={`text-2xs font-bold uppercase tracking-[0.08em] ${
                isSelected ? "text-white/70" : "text-text-muted"
              }`}
            >
              GW{w.event}
            </span>
            <span
              className={`font-mono text-md font-bold leading-none ${
                isSelected ? "text-white" : "text-text-primary"
              }`}
            >
              {w.points.toFixed(0)}
            </span>

            {/* One line, always present so the tiles stay the same height -
                it just has nothing to say on a quiet week. */}
            <span className="flex min-h-[16px] flex-wrap items-center justify-center gap-1">
              {transfers > 0 && (
                <span
                  className={`rounded-sm px-1 py-0.5 text-3xs font-bold ${
                    isSelected ? "bg-white/20 text-white" : "bg-pl-purple/10 text-pl-purple"
                  }`}
                  title={`${transfers} transfer${transfers === 1 ? "" : "s"} planned`}
                >
                  ⇄{transfers}
                </span>
              )}
              {hit > 0 && (
                <span
                  className={`font-mono text-3xs font-bold ${isSelected ? "text-white" : "text-danger"}`}
                  title={`${hit}-point hit for transfers beyond your free ones`}
                >
                  -{hit}
                </span>
              )}
              {w.flagged && (
                <span
                  className={`font-mono text-3xs font-bold ${isSelected ? "text-white" : "text-warning"}`}
                  title={
                    w.flagged.blankCount >= w.flagged.doubleCount
                      ? `${w.flagged.blankCount} of your squad blank this week`
                      : `${w.flagged.doubleCount} of your squad play twice this week`
                  }
                >
                  {w.flagged.blankCount >= w.flagged.doubleCount
                    ? `0·${w.flagged.blankCount}`
                    : `×2·${w.flagged.doubleCount}`}
                </span>
              )}
              {w.delta !== 0 && (
                <span
                  className={`font-mono text-3xs font-bold ${
                    isSelected ? "text-white/90" : w.delta > 0 ? "text-success" : "text-danger"
                  }`}
                  title="Change against this week with no plan at all"
                >
                  {w.delta > 0 ? "+" : ""}
                  {w.delta.toFixed(1)}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
