import type { ChipResponse } from "@/shared/types/api";

export type ChipSuggestion = { name: string; event: number; detail: string };

/**
 * The soonest chip worth playing, so a summary can show one recommendation
 * instead of four. Only looks at the current period (periods[0]) - chips reset
 * fresh at the mid-season deadline (see fpl.model.rules.CHIP_RESET_EVENT), so a
 * suggestion from the far side of that reset isn't playable yet.
 *
 * Shared by the home dashboard and the squad dashboard; the full per-period
 * scan still lives on the squad page's Chips tab (see ChipPeriodCards).
 */
export function nextChip(chips: ChipResponse | null): ChipSuggestion | null {
  const period = chips?.periods[0];
  if (!period) return null;
  const options = [
    period.wildcard && {
      name: "Wildcard",
      event: period.wildcard.suggested_event,
      detail: period.wildcard.reason,
    },
    {
      name: "Triple Captain",
      event: period.triple_captain.event,
      detail: period.triple_captain.player,
    },
    {
      // 3dp, matching the backend's own rounding: bench_score is the sum of
      // four sub-1.0 recommendation scores (0.0-0.263 across a full scan), so
      // coarser rounding collapses nearly every value to "0.0".
      name: "Bench Boost",
      event: period.bench_boost.event,
      detail: `Bench worth ${period.bench_boost.bench_score.toFixed(3)}`,
    },
    period.free_hit.recommended && {
      name: "Free Hit",
      event: period.free_hit.event,
      detail: `${period.free_hit.blank_count} blanking`,
    },
  ].filter(Boolean) as ChipSuggestion[];
  return options.sort((a, b) => a.event - b.event)[0] ?? null;
}
