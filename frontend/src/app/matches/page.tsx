"use client";

import { useState } from "react";
import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { Pill } from "@/shared/ui/Pill";
import { ScheduleView } from "@/features/matches/ScheduleView";
import { DifficultyView } from "@/features/matches/DifficultyView";

type View = "schedule" | "difficulty";

export default function MatchesPage() {
  const [view, setView] = useState<View>("schedule");
  return (
    <PageContainer>
      <PageHeader
        title="Matches"
        subtitle="2026/27 fixtures, results, and difficulty - gameweek by gameweek."
      />
      <div className="flex gap-1.5">
        <Pill active={view === "schedule"} onClick={() => setView("schedule")}>
          Schedule
        </Pill>
        <Pill active={view === "difficulty"} onClick={() => setView("difficulty")}>
          Difficulty
        </Pill>
      </div>
      {view === "schedule" ? <ScheduleView /> : <DifficultyView />}
    </PageContainer>
  );
}
