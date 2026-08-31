"use client";

import { useState } from "react";
import { Tabs, TabPanel, type TabItem } from "@/shared/ui/Tabs";
import { TeamLeaderboard } from "./TeamLeaderboard";
import type { LeaderboardEntry, Metric } from "@/shared/types/api";

/**
 * The team page renders one leaderboard per backend metric, and there are 14 of
 * them - 14 cards x 5 rows was ~350 values in a single scroll. Grouping them
 * puts at most six on screen at a time without dropping any.
 *
 * Keyed by metric key rather than index so a backend reordering can't silently
 * shuffle metrics into the wrong group; anything unrecognised falls through to
 * "More" so a newly added metric still renders somewhere.
 */
type GroupId = "scoring" | "attacking" | "minutes" | "discipline" | "more";

const GROUPS: { id: GroupId; label: string; keys: string[] }[] = [
  { id: "scoring", label: "Scoring", keys: ["total_points", "predicted_points", "bonus"] },
  {
    id: "attacking",
    label: "Attacking",
    keys: [
      "goals_scored",
      "assists",
      "goal_involvements",
      "expected_goals",
      "expected_assists",
      "expected_goal_involvements",
    ],
  },
  { id: "minutes", label: "Minutes", keys: ["minutes", "expected_minutes"] },
  {
    id: "discipline",
    label: "Defence & cards",
    keys: ["defensive_contribution", "yellow_cards", "red_cards"],
  },
];

export function TeamMetricTabs({
  metrics,
  leaderboards,
}: {
  metrics: Metric[];
  leaderboards: Record<string, LeaderboardEntry[]>;
}) {
  const grouped = GROUPS.map((g) => ({
    ...g,
    metrics: metrics.filter((m) => g.keys.includes(m.key)),
  }));
  const claimed = new Set(GROUPS.flatMap((g) => g.keys));
  const leftover = metrics.filter((m) => !claimed.has(m.key));
  if (leftover.length > 0) {
    grouped.push({ id: "more", label: "More", keys: [], metrics: leftover });
  }

  const visible = grouped.filter((g) => g.metrics.length > 0);
  const [group, setGroup] = useState<GroupId>(visible[0]?.id ?? "scoring");

  if (visible.length === 0) return null;

  const tabs: TabItem<GroupId>[] = visible.map((g) => ({
    id: g.id,
    label: g.label,
    badge: g.metrics.length,
  }));

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={tabs} value={group} onChange={setGroup} label="Stat groups" />
      {visible.map((g) => (
        <TabPanel key={g.id} id={g.id} active={g.id === group}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.metrics.map((m) => (
              <TeamLeaderboard key={m.key} metric={m} rows={leaderboards[m.key] ?? []} />
            ))}
          </div>
        </TabPanel>
      ))}
    </div>
  );
}
