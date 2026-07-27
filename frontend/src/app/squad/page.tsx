"use client";

import { useEffect, useState } from "react";
import { useTeam } from "@/components/team/TeamProvider";
import { LoadTeamPanel } from "@/components/squad/LoadTeamPanel";
import { BuildSquadPanel } from "@/components/squad/BuildSquadPanel";
import { OptimizePanel } from "@/components/squad/OptimizePanel";

type Mode = "load" | "build" | "optimize";

const TABS: { mode: Mode; label: string }[] = [
  { mode: "load", label: "Load my team" },
  { mode: "build", label: "Build from scratch" },
  { mode: "optimize", label: "Optimizer" },
];

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
          Load your real squad by team ID, build one from scratch, or let the solver find the optimal squad or
          transfers.
        </p>

        <div className="mb-6 flex overflow-x-auto rounded-lg border border-border bg-white p-1 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab.mode}
              type="button"
              onClick={() => chooseMode(tab.mode)}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                mode === tab.mode ? "bg-pl-purple text-white" : "text-text-secondary hover:bg-surface-sunken"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === "load" && <LoadTeamPanel onSwitchToOptimize={() => chooseMode("optimize")} />}
        {mode === "build" && <BuildSquadPanel onSwitchToOptimize={() => chooseMode("optimize")} />}
        {mode === "optimize" && <OptimizePanel />}
      </div>
    </main>
  );
}
