/**
 * Every backend call the squad feature makes, in one place.
 *
 * The panels used to build these URLs inline, which is why the same endpoint
 * was being called with different query strings from different files with no
 * single place to see the shape of a request. Query params are assembled here
 * so callers pass values, not strings.
 */
import { apiGet } from "@/shared/lib/api";
import type {
  BestSquadResult,
  ChipResponse,
  PlannerResponse,
  PlayerAlternative,
  PlayerListItem,
  PlayerTrajectory,
  PoolPlayer,
  SquadBuilderFixtureRow,
  SquadResponse,
  TransferResult,
} from "@/shared/types/api";

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function getSquad(teamId: string | number) {
  return apiGet<SquadResponse>(`/api/squad/${teamId}`);
}

/**
 * Called from two places with different params: the loaded-team panel passes
 * only free_transfers and lets the backend default the rest, while the
 * optimizer panel drives every knob from its own form.
 */
export function optimizeTransfers(
  teamId: string | number,
  params: {
    free_transfers?: number;
    event?: number;
    reference_date?: string;
    next_event?: number;
    gw_count?: number;
    /** Force exactly this many transfers instead of letting the solver pick its own count. */
    transfers?: number;
  },
) {
  return apiGet<TransferResult>(
    `/api/squad/${teamId}/optimize-transfers${query(params)}`,
  );
}

export function getPlanner(teamId: string | number) {
  return apiGet<PlannerResponse>(`/api/squad/${teamId}/planner`);
}

export function getChips(teamId: string | number) {
  return apiGet<ChipResponse>(`/api/squad/${teamId}/chips`);
}

/**
 * `exclude` keeps players already in the squad/draft out of the suggestions;
 * `maxCost` caps candidates at what's affordable - the bank (or budget left)
 * plus whatever selling the replaced player frees up.
 */
export function getAlternatives(
  playerId: number,
  params: { limit?: number; exclude?: number[]; maxCost?: number } = {},
) {
  return apiGet<PlayerAlternative[]>(
    `/api/players/${playerId}/alternatives${query({
      limit: params.limit ?? 5,
      exclude: params.exclude?.length ? params.exclude.join(",") : undefined,
      max_cost: params.maxCost,
    })}`,
  );
}

/**
 * Free-text player search, scoped to one position.
 *
 * The alternatives endpoint above answers "who should I bring in" and
 * deliberately returns a short ranked shortlist; this answers "I already
 * know who I want" - so it's a name/team match over the whole pool, with
 * no affordability cutoff (the caller decides how to present a player the
 * bank can't currently cover).
 */
export function searchPlayers(params: { search: string; position?: string; limit?: number }) {
  return apiGet<PlayerListItem[]>(
    `/api/players${query({
      search: params.search,
      position: params.position,
      limit: params.limit ?? 40,
    })}`,
  );
}

export function getTrajectory(
  playerId: number,
  params: { gw_count: number; next_event: number },
) {
  return apiGet<PlayerTrajectory>(
    `/api/players/${playerId}/trajectory${query(params)}`,
  );
}

export function getBestSquad(params: {
  reference_date: string;
  next_event: number;
  gw_count: number;
  budget: number;
}) {
  return apiGet<BestSquadResult>(`/api/optimizer/best-squad${query(params)}`);
}

export function getPlayerPool() {
  return apiGet<PoolPlayer[]>("/api/squad-builder/players");
}

export function getBuilderFixtures() {
  return apiGet<SquadBuilderFixtureRow[]>("/api/squad-builder/fixtures");
}
