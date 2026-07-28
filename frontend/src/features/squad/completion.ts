/**
 * One-click "finish my squad": fills every empty slot with an affordable pick.
 * Pure, and deliberately not an optimizer - the Optimizer tab does that.
 */
import type { PoolPlayer, Position } from "@/shared/types/api";
import { MAX_PER_CLUB, POSITION_LIMITS, POSITION_ORDER } from "./diagnostics";

// Greedy completion for "Finish my squad": fills every still-empty slot
// with the highest predicted_points player that's affordable, available
// (status "a"), and legal (not already owned, club count < MAX_PER_CLUB).
// Fills round-robin across positions (one GKP slot, one DEF slot, one MID
// slot, one FWD slot, repeat) rather than exhausting one position before
// the next - exhausting GKP/DEF/MID first tends to blow the budget on
// expensive picks there and strand FWD with only bargain-bin options left.
// "Affordable" also reserves enough of the remaining budget for every
// other still-empty slot (each valued at the cheapest eligible player left
// at that position), so a pick can't spend so much it strands a later one.
// Not a provably optimal squad (see the Optimizer tab for that), just a
// reasonable one-click starting point.
export function pickSquadCompletion(
  players: PoolPlayer[],
  squad: PoolPlayer[],
  squadIds: Set<number>,
  budget: number
): { newIds: number[]; skippedPositions: Position[] } {
  const selected = new Set(squadIds);
  const clubCounts = new Map<string, number>();
  for (const p of squad) clubCounts.set(p.team_short, (clubCounts.get(p.team_short) ?? 0) + 1);

  const remainingByPos = {} as Record<Position, number>;
  for (const pos of POSITION_ORDER) {
    remainingByPos[pos] = POSITION_LIMITS[pos] - squad.filter((p) => p.position === pos).length;
  }

  const byPos = {} as Record<Position, PoolPlayer[]>;
  for (const pos of POSITION_ORDER) byPos[pos] = players.filter((p) => p.position === pos);

  function cheapestEligible(pos: Position): number {
    let min = Infinity;
    for (const p of byPos[pos]) {
      if (selected.has(p.id)) continue;
      if ((clubCounts.get(p.team_short) ?? 0) >= MAX_PER_CLUB) continue;
      if (p.cost < min) min = p.cost;
    }
    return Number.isFinite(min) ? min : 4.0; // shouldn't happen; safe floor
  }

  let remainingBudget = budget - squad.reduce((sum, p) => sum + p.cost, 0);
  const newIds: number[] = [];
  const skippedPositions: Position[] = [];
  const failedPositions = new Set<Position>();

  function fillOneSlot(pos: Position): boolean {
    const reserve = POSITION_ORDER.reduce((sum, otherPos) => {
      const count = remainingByPos[otherPos] - (otherPos === pos ? 1 : 0);
      return count > 0 ? sum + count * cheapestEligible(otherPos) : sum;
    }, 0);
    const cap = remainingBudget - reserve;

    const eligible = (p: PoolPlayer) => !selected.has(p.id) && (clubCounts.get(p.team_short) ?? 0) < MAX_PER_CLUB;
    let candidates = byPos[pos].filter((p) => eligible(p) && p.status === "a" && p.cost <= cap + 1e-9);
    if (candidates.length === 0) candidates = byPos[pos].filter((p) => eligible(p) && p.cost <= cap + 1e-9);
    if (candidates.length === 0) candidates = byPos[pos].filter((p) => eligible(p) && p.cost <= remainingBudget + 1e-9);
    if (candidates.length === 0) return false;

    const pick = candidates.reduce((best, p) => (p.predicted_points > best.predicted_points ? p : best));
    selected.add(pick.id);
    newIds.push(pick.id);
    clubCounts.set(pick.team_short, (clubCounts.get(pick.team_short) ?? 0) + 1);
    remainingBudget = Math.round((remainingBudget - pick.cost) * 10) / 10;
    remainingByPos[pos] -= 1;
    return true;
  }

  let madeProgress = true;
  while (madeProgress && POSITION_ORDER.some((pos) => remainingByPos[pos] > 0 && !failedPositions.has(pos))) {
    madeProgress = false;
    for (const pos of POSITION_ORDER) {
      if (remainingByPos[pos] <= 0 || failedPositions.has(pos)) continue;
      if (fillOneSlot(pos)) {
        madeProgress = true;
      } else {
        failedPositions.add(pos);
        skippedPositions.push(pos);
      }
    }
  }

  return { newIds, skippedPositions };
}
