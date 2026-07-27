"use client";

import { useSeasonStatus } from "@/shared/lib/useSeasonStatus";

type Mode =
  // predict_multi_gw_points/breakdown-backed pages (Outlook, Optimizer,
  // Squad Builder, Players, Player detail, My Squad's suggested transfers) -
  // these blend in live current-season results as they accumulate (see
  // team_model.py's compute_*_blended functions).
  | "blended"
  // compute_player_scores-backed pages (Differentials, Chips, My Squad's
  // category scores) - this is a deliberately separate, always-archived
  // model (recommendation_score), independent of team_model.py's
  // predict_points and NOT given live-blend capability - stays on the
  // archived season regardless of how far into the current one we are.
  | "archived";

// One shared source for "is this still demo/archived data", backed by
// /api/season-status (see lib/seasonStatus.ts) - replaces the ~15 separate
// hardcoded "(demo data: 2025/26)" strings this app used to have scattered
// across pages, each guessing independently at the season boundary. Falls
// back to the pre-season copy while loading/on error - correct today, and
// the safer of the two guesses either way.
export function SeasonDataNote({ mode, className = "" }: { mode: Mode; className?: string }) {
  const status = useSeasonStatus();
  const archive = status?.archive_season_label ?? "2025/26";
  const current = status?.current_season_label ?? "2026/27";
  const isPreseason = status?.is_preseason ?? true;

  let text: string;
  if (mode === "archived") {
    text = `Scored against ${archive} results - a separate, independent model from the multi-gameweek predictions elsewhere in the app.`;
  } else if (isPreseason) {
    text = `Predictions are trained on ${archive} results, since ${current} has none of its own yet.`;
  } else {
    text = `Predictions blend ${archive} history with live ${current} results as the season progresses.`;
  }

  return <span className={className}>{text}</span>;
}
