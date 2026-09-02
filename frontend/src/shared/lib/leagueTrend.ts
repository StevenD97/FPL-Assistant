import type { TrendEntry } from "@/shared/types/api";

/** How many trend lines the league chart draws before you ask for the rest. */
export const TREND_SERIES_CAP = 5;

/**
 * Which managers' lines to plot. A league can return 20 entries and 20 lines on
 * one axis is unreadable, so only the leading few are drawn - but your own team
 * is always kept, whatever its rank, so the chart stays about you.
 *
 * Entries arrive in rank order, so "leading few" is just the head of the list.
 */
export function pickTrendSeries(
  all: TrendEntry[],
  { showAll, myEntryId }: { showAll: boolean; myEntryId: number | null },
): TrendEntry[] {
  if (showAll || all.length <= TREND_SERIES_CAP) return all;
  const top = all.slice(0, TREND_SERIES_CAP);
  const mine = myEntryId != null ? all.find((t) => t.entry_id === myEntryId) : undefined;
  return mine && !top.includes(mine) ? [...top, mine] : top;
}
