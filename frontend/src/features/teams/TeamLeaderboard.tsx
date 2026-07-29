import { PlayerLink } from "@/shared/ui/PlayerLink";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import type { StatGlossaryKey } from "@/shared/lib/statGlossary";
import type { LeaderboardEntry, Metric } from "@/shared/types/api";

// Maps the API's metric.key (see backend/fpl/services/teams.py) to its glossary entry.
const METRIC_TOOLTIP: Record<string, StatGlossaryKey> = {
  total_points: "totalPts",
  predicted_points: "xPts",
  goals_scored: "goals",
  expected_goals: "xg",
  assists: "assists",
  expected_assists: "xa",
  goal_involvements: "goalInvolvements",
  expected_goal_involvements: "xgi",
  minutes: "minutes",
  expected_minutes: "xMins",
  defensive_contribution: "defensiveContributions",
  yellow_cards: "yellowCards",
  red_cards: "redCards",
  bonus: "bonus",
};

// xG/xA/xGI/xPts read as one decimal place everywhere else in the app
// (the player card, the hero stats) - matched here for consistency. Every
// other metric here is a whole-number count (goals, minutes, cards, ...).
const ONE_DECIMAL_KEYS = new Set([
  "expected_goals", "expected_assists", "expected_goal_involvements", "predicted_points",
]);

function formatValue(key: string, value: number): string {
  return ONE_DECIMAL_KEYS.has(key) ? value.toFixed(1) : String(value);
}

// One metric's top-5 leaderboard within a single club - rank, photo, name,
// position, value. "Model" metrics (xPts, xMins) are this app's own
// forward-looking projection, not an FPL-published stat, so they're tagged
// distinctly from the "2025/26" archived-season actuals everything else here
// is built from (see fpl/services/teams.py).
export function TeamLeaderboard({ metric, rows }: { metric: Metric; rows: LeaderboardEntry[] }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1 text-sm font-semibold text-text-primary">
          {metric.label}
          {METRIC_TOOLTIP[metric.key] && <InfoTooltip term={METRIC_TOOLTIP[metric.key]} />}
        </h3>
        <span
          className={`shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide ${
            metric.kind === "model" ? "bg-pl-purple/10 text-pl-purple" : "bg-surface-sunken text-text-muted"
          }`}
        >
          {metric.kind === "model" ? "Model" : "2025/26"}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-text-muted">No qualifying players yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-2">
              <span className="w-3.5 shrink-0 font-mono text-xs font-semibold text-text-muted">{i + 1}</span>
              <PlayerPhoto
                src={r.player_photo}
                name={r.web_name}
                className="h-7 w-7 shrink-0 rounded-full border border-border bg-surface-sunken object-cover object-top text-[9px]"
              />
              <PlayerLink id={r.id} className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                {r.web_name}
              </PlayerLink>
              <PositionBadge position={r.position} />
              <span className="w-11 shrink-0 text-right font-mono text-sm font-bold text-pl-purple">
                {formatValue(metric.key, r.value)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
