"use client";

import { Button } from "@/shared/ui/Button";
import { useTeam } from "@/shared/team/TeamProvider";

// A real, resolvable FPL team id used as the "explore without your own ID"
// sample (also the placeholder shown throughout the app).
const SAMPLE_TEAM_ID = "1178869";

// The one coached empty state for anything that needs a connected team. Rather
// than a bare "enter your Team ID" box, it offers the global connect flow plus
// a sample team so a first-time visitor can explore the personalised views.
export function ConnectTeamPrompt({
  title = "Connect your team",
  body = "Add your FPL team once and every page tailors to your squad — chips, transfers, league ranks. Saved on this device, no login.",
}: {
  title?: string;
  body?: string;
}) {
  const { promptConnect, connect, status } = useTeam();
  return (
    <div className="rounded-lg border border-border bg-white p-6 text-center shadow-sm">
      <h2 className="text-md font-bold text-pl-purple">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-text-secondary">{body}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Button variant="accent" onClick={promptConnect}>
          Connect your team
        </Button>
        <Button variant="secondary" onClick={() => connect(SAMPLE_TEAM_ID)} disabled={status === "loading"}>
          {status === "loading" ? "Loading…" : "Try a sample team"}
        </Button>
      </div>
    </div>
  );
}
