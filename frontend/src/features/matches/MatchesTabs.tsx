"use client";

import { useState } from "react";
import { Pill } from "@/shared/ui/Pill";
import type { FixtureDifficultyRow, ScheduleFixture } from "@/shared/types/api";
import { ScheduleView } from "./ScheduleView";
import { DifficultyView } from "./DifficultyView";

type View = "schedule" | "difficulty";

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
      <div className="flex gap-1.5">
        <Pill active={view === "schedule"} onClick={() => setView("schedule")}>
          Schedule
        </Pill>
        <Pill active={view === "difficulty"} onClick={() => setView("difficulty")}>
          Difficulty
        </Pill>
      </div>
      {view === "schedule" ? (
        <ScheduleView fixtures={fixtures} />
      ) : (
        <DifficultyView rows={difficulty} />
      )}
    </>
  );
}
