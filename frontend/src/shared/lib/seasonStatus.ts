import { apiGet } from "./api";
import type { SeasonStatus } from "@/shared/types/api";

export type { SeasonStatus };

// Single source of truth for "is this still demo/archived data" - backed by
// the same analysis.get_gw_context() every prediction endpoint's dynamic
// defaults use (see backend/app/main.py's /api/season-status), so this can
// never drift out of sync with what the API is actually doing. Previously
// ~15 separate hardcoded "(demo data: 2025/26)" strings across different
// pages, each guessing independently at the season boundary.
export function fetchSeasonStatus(): Promise<SeasonStatus> {
  return apiGet<SeasonStatus>("/api/season-status");
}
