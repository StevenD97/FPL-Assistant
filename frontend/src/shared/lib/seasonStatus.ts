import { apiGet } from "./api";
import type { SeasonStatus } from "@/shared/types/api";

export type { SeasonStatus };

// Single source of truth for "is this still demo/archived data" - backed by
// the same analysis.get_gw_context() every prediction endpoint's dynamic
// defaults use (see backend/app/main.py's /api/season-status), so this can
// never drift out of sync with what the API is actually doing. Previously
// ~15 separate hardcoded "(demo data: 2025/26)" strings across different
// pages, each guessing independently at the season boundary.
// Shared across callers. Several components read season status independently -
// the two sidebar countdowns, the cockpit's deadline, the hero action, the
// archived-data notes - and each used to fire its own request, so a page load
// made five or six identical calls. The season boundary doesn't move within a
// page view, so one request per tab is plenty.
let inFlight: Promise<SeasonStatus> | null = null;

export function fetchSeasonStatus(): Promise<SeasonStatus> {
  inFlight ??= apiGet<SeasonStatus>("/api/season-status").catch((err) => {
    // Don't cache a failure - the next caller (or a later mount) should retry.
    inFlight = null;
    throw err;
  });
  return inFlight;
}
