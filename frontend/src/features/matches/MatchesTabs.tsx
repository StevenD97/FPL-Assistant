"use client";

import { useState } from "react";
import { Tabs, TabPanel, type TabItem } from "@/shared/ui/Tabs";
import { FixtureDifficultyTable } from "@/shared/ui/FixtureDifficultyTable";
import type { FixtureDifficultyRow, ScheduleFixture } from "@/shared/types/api";
import { ScheduleView } from "./ScheduleView";

type View = "schedule" | "difficulty";

const VIEWS: readonly TabItem<View>[] = [
  { id: "schedule", label: "Schedule" },
  { id: "difficulty", label: "Difficulty" },
];

/**
 * Owns only which tab is showing. Both datasets are fetched on the server and
 * passed in, so switching tabs is instant and neither view fetches on mount.
 */
export function MatchesTabs({
  fixtures,
  difficulty,
}: {
  fixtures: ScheduleFixture[];
  difficulty: FixtureDifficultyRow[];
}) {
  const [view, setView] = useState<View>("schedule");
  return (
    <>
      <Tabs tabs={VIEWS} value={view} onChange={setView} label="Matches views" />
      <TabPanel id="schedule" active={view === "schedule"}>
        <ScheduleView fixtures={fixtures} />
      </TabPanel>
      <TabPanel id="difficulty" active={view === "difficulty"}>
        <FixtureDifficultyTable rows={difficulty} />
      </TabPanel>
    </>
  );
}
