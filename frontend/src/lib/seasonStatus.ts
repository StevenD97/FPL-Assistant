import { fetchJson } from "./api";

export type SeasonStatus = {
  is_preseason: boolean;
  next_event: number;
  archive_season_label: string;
  current_season_label: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Single source of truth for "is this still demo/archived data" - backed by
// the same analysis.get_gw_context() every prediction endpoint's dynamic
// defaults use (see backend/app/main.py's /api/season-status), so this can
// never drift out of sync with what the API is actually doing. Previously
// ~15 separate hardcoded "(demo data: 2025/26)" strings across different
// pages, each guessing independently at the season boundary.
export function fetchSeasonStatus(): Promise<SeasonStatus> {
  return fetchJson(`${API_URL}/api/season-status`);
}
