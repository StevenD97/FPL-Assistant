/**
 * Endpoints the landing-page cockpit reads that aren't squad-specific.
 *
 * Lives in shared/ rather than features/home/ for the same reason
 * shared/api/squad.ts does: the home and squad features both need these, and
 * features are not allowed to import each other.
 */
import { apiGet } from "@/shared/lib/api";
import type {
  FixtureDifficultyRow,
  League,
  PlayerListItem,
  PriceWatchResponse,
} from "@/shared/types/api";

export function getPlayers() {
  return apiGet<PlayerListItem[]>("/api/players");
}

/** Every club's next-N-fixture difficulty, kindest run first when sorted. */
export function getFixtureDifficulty(startEvent = 1, windowSize = 5) {
  return apiGet<FixtureDifficultyRow[]>(
    `/api/fixtures/difficulty?start_event=${startEvent}&window_size=${windowSize}`,
  );
}

export function getManagerLeagues(teamId: number) {
  return apiGet<League[]>(`/api/leagues/${teamId}`);
}

/** Top movers overall. */
export function getPriceWatch(limit = 15) {
  return apiGet<PriceWatchResponse>(`/api/players/price-watch?limit=${limit}`);
}

/** Movers restricted to the ids given - the `owned` variant of the response. */
export function getOwnedPriceWatch(playerIds: number[]) {
  return apiGet<PriceWatchResponse>(
    `/api/players/price-watch?player_ids=${playerIds.join(",")}`,
  );
}
