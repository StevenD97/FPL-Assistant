import type {
  PlannerOpponent,
  PlannerResponse,
  Position,
  SquadPlayer,
  TrajectoryRow,
} from "@/shared/types/api";

/**
 * FPL banks unused free transfers, gaining one more each gameweek you don't
 * spend it, up to this cap.
 */
export const FREE_TRANSFER_CAP = 5;
/** Points lost per transfer beyond your free ones - matches the optimizer's own
 * POINTS_PER_TRANSFER_HIT (fpl/optimize/squad.py), so the two reads agree. */
export const HIT_COST = 4;

export type PlanCandidate = {
  id: number;
  web_name: string;
  cost: number;
  position: Position;
  player_photo: string;
  team_short: string;
  team_badge: string;
};

export type PlanEntry = {
  /** `${outLiveId}:${gwEvent}` - adding another entry for the same pair replaces it. */
  key: string;
  gwEvent: number;
  /** The squad slot being changed, identified by its live id - stable across
   * the plan regardless of who's occupying it at any given gameweek. */
  outLiveId: number;
  inPlayer: PlanCandidate;
  /** This candidate's own predicted points, gwEvent through the end of the
   * planning window - fetched once, up front, same as any other swap preview. */
  inTrajectory: TrajectoryRow[];
};

export function planEntryKey(outLiveId: number, gwEvent: number): string {
  return `${outLiveId}:${gwEvent}`;
}

function toOriginalCandidate(p: SquadPlayer): PlanCandidate {
  return {
    id: p.live_id ?? p.id,
    web_name: p.web_name,
    cost: p.cost,
    position: p.pos,
    player_photo: p.player_photo,
    team_short: p.team_short,
    team_badge: p.team_badge,
  };
}

/** Entries for one slot, oldest first - the order every resolver below assumes. */
function entriesForSlot(entries: PlanEntry[], outLiveId: number): PlanEntry[] {
  return entries.filter((e) => e.outLiveId === outLiveId).sort((a, b) => a.gwEvent - b.gwEvent);
}

/** Whichever planned transfer most recently took effect by this gameweek, if any. */
function activeEntryAt(sortedEntries: PlanEntry[], gwEvent: number): PlanEntry | null {
  let active: PlanEntry | null = null;
  for (const entry of sortedEntries) {
    if (entry.gwEvent > gwEvent) break;
    active = entry;
  }
  return active;
}

/** Who occupies a slot for a given gameweek - the original owner, or whichever
 * planned transfer most recently took effect by then. Chains correctly across
 * several transfers on the same slot (e.g. GW16 in Munoz, GW22 in someone else). */
export function currentOccupantForGw(original: SquadPlayer, entries: PlanEntry[], gwEvent: number): PlanCandidate {
  const outLiveId = original.live_id ?? original.id;
  const active = activeEntryAt(entriesForSlot(entries, outLiveId), gwEvent);
  return active ? active.inPlayer : toOriginalCandidate(original);
}

export type PlanCell = {
  event: number;
  occupant: PlanCandidate;
  isOriginalOccupant: boolean;
  predictedPoints: number | null;
  flags: string[];
  fixtureCount: number;
  /** Who this slot's occupant actually plays that week - empty on a blank. */
  opponents: PlannerOpponent[];
  /** True on the first gameweek a planned transfer takes effect - the boundary worth marking in the UI. */
  transferStartsHere: boolean;
};

export type SlotRow = {
  outLiveId: number;
  original: SquadPlayer;
  /** Which slot this is - transfers swap the occupant, never the slot's place in the XI. */
  role: SquadPlayer["role"];
  cells: PlanCell[];
};

/**
 * One row per owned squad slot, one cell per planner gameweek: who occupies
 * it under the plan, and their predicted points for that specific gameweek.
 * Players without a live id are skipped - the same rule the pitch and detail
 * table already apply, since there's nothing to fetch alternatives/trajectory
 * for without one.
 */
export function buildSlotRows(squad: SquadPlayer[], planner: PlannerResponse, entries: PlanEntry[]): SlotRow[] {
  const trajectoryByLiveId = new Map(planner.players.map((p) => [p.id, p]));
  return squad
    .filter((p) => p.live_id != null)
    .map((original) => {
      const outLiveId = original.live_id as number;
      const sorted = entriesForSlot(entries, outLiveId);
      const originalTrajectory = trajectoryByLiveId.get(outLiveId)?.trajectory ?? [];
      const cells: PlanCell[] = planner.next_events.map((event) => {
        const active = activeEntryAt(sorted, event);
        const occupant = active ? active.inPlayer : toOriginalCandidate(original);
        const row = active
          ? active.inTrajectory.find((t) => t.event === event)
          : originalTrajectory.find((t) => t.event === event);
        return {
          event,
          occupant,
          isOriginalOccupant: active == null,
          predictedPoints: row?.predicted_points ?? null,
          flags: row?.flags ?? [],
          fixtureCount: row?.fixture_count ?? 0,
          opponents: row?.opponents ?? [],
          transferStartsHere: active != null && active.gwEvent === event,
        };
      });
      return { outLiveId, original, role: original.role, cells };
    });
}

export type WeeklyProjection = {
  event: number;
  entries: PlanEntry[];
  transfersMade: number;
  freeAvailable: number;
  freeUsed: number;
  hitCount: number;
  hitPoints: number;
  costDelta: number;
  bankAfter: number;
};

/**
 * Free transfers accumulate one a week up to FREE_TRANSFER_CAP; anything
 * beyond what's free costs HIT_COST points each - the same rule the
 * single-window optimizer prices in, carried across the whole plan instead
 * of one gameweek. Bank runs cumulatively from the squad's current bank, in
 * gameweek order, regardless of the order entries were added in.
 */
export function computeWeeklyProjection(
  entries: PlanEntry[],
  squad: SquadPlayer[],
  events: number[],
  startFreeTransfers: number,
  startBank: number,
): WeeklyProjection[] {
  const byLiveId = new Map(squad.filter((p) => p.live_id != null).map((p) => [p.live_id as number, p]));
  const sorted = [...entries].sort((a, b) => a.gwEvent - b.gwEvent);

  let freeAvailable = startFreeTransfers;
  let bank = startBank;
  const rows: WeeklyProjection[] = [];
  for (const event of events) {
    const weekEntries = sorted.filter((e) => e.gwEvent === event);
    let costDelta = 0;
    for (const entry of weekEntries) {
      const original = byLiveId.get(entry.outLiveId);
      if (!original) continue;
      const priorOwner = currentOccupantForGw(original, sorted, entry.gwEvent - 1);
      costDelta += entry.inPlayer.cost - priorOwner.cost;
    }
    const transfersMade = weekEntries.length;
    const freeUsed = Math.min(transfersMade, freeAvailable);
    const hitCount = Math.max(0, transfersMade - freeAvailable);
    bank = Math.round((bank - costDelta) * 10) / 10;
    rows.push({
      event,
      entries: weekEntries,
      transfersMade,
      freeAvailable,
      freeUsed,
      hitCount,
      hitPoints: hitCount * HIT_COST,
      costDelta,
      bankAfter: bank,
    });
    freeAvailable = Math.min(FREE_TRANSFER_CAP, freeAvailable - freeUsed + 1);
  }
  return rows;
}

/**
 * What's left to spend on a replacement for `outLiveId` at `gwEvent`: the
 * bank projected to be left entering that gameweek (after every other planned
 * transfer up to and including that week, but excluding whatever's currently
 * planned for this exact slot+gameweek, since it's being replaced) plus
 * whatever selling the slot's occupant at that point would free up.
 */
export function budgetForNewEntry(params: {
  entries: PlanEntry[];
  squad: SquadPlayer[];
  events: number[];
  startFreeTransfers: number;
  startBank: number;
  outLiveId: number;
  gwEvent: number;
}): number {
  const { entries, squad, events, startFreeTransfers, startBank, outLiveId, gwEvent } = params;
  const withoutThis = entries.filter((e) => !(e.outLiveId === outLiveId && e.gwEvent === gwEvent));
  const projection = computeWeeklyProjection(withoutThis, squad, events, startFreeTransfers, startBank);
  const idx = events.indexOf(gwEvent);
  if (idx < 0) return startBank;
  const bankBeforeThisWeek = idx > 0 ? projection[idx - 1].bankAfter : startBank;
  const bankAfterOthersThisWeek = bankBeforeThisWeek - projection[idx].costDelta;
  const original = squad.find((p) => p.live_id === outLiveId);
  if (!original) return Math.round(bankAfterOthersThisWeek * 10) / 10;
  const currentOccupant = currentOccupantForGw(original, withoutThis, gwEvent);
  return Math.round((bankAfterOthersThisWeek + currentOccupant.cost) * 10) / 10;
}
