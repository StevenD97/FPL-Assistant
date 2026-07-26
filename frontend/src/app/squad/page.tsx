"use client";

import { useEffect, useState } from "react";
import { useTeam } from "@/components/team/TeamProvider";
import { LoadTeamPanel } from "@/components/squad/LoadTeamPanel";
import { BuildSquadPanel } from "@/components/squad/BuildSquadPanel";

type Mode = "load" | "build";

export default function SquadPage() {
  const { teamId: connectedId } = useTeam();
  const [mode, setMode] = useState<Mode>("load");
  const [modeChosen, setModeChosen] = useState(false);

  // Default to "Load my team" once a connected team shows up (e.g. restored
  // from localStorage on mount); otherwise default to "Build from scratch" -
  // most useful pre-season, before anyone has a real fetchable squad. Only
  // applies until the user picks a mode themselves.
  useEffect(() => {
    if (modeChosen) return;
    setMode(connectedId != null ? "load" : "build");
  }, [connectedId, modeChosen]);

  function chooseMode(next: Mode) {
    setModeChosen(true);
    setMode(next);
  }

  return (
    <main className="px-4 py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 font-sans text-lg font-bold tracking-tight text-pl-purple">
          My squad
        </h1>
        <p className="mb-4 text-sm text-text-secondary">
          Load your real squad by team ID, or build one from scratch - handy before the season locks your first
          squad in.
        </p>

        <div className="mb-6 inline-flex rounded-lg border border-border bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => chooseMode("load")}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              mode === "load" ? "bg-pl-purple text-white" : "text-text-secondary hover:bg-surface-sunken"
            }`}
          >
            Load my team
          </button>
          <button
            type="button"
            onClick={() => chooseMode("build")}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              mode === "build" ? "bg-pl-purple text-white" : "text-text-secondary hover:bg-surface-sunken"
            }`}
          >
            Build from scratch
          </button>
        </div>
      </div>

      {mode === "load" ? <LoadTeamPanel /> : <BuildSquadPanel />}
    </main>
  );
}
