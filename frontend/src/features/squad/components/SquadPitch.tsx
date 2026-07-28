import { PlayerLink } from "@/shared/ui/PlayerLink";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { PitchFormation, type PitchPlayer } from "@/shared/pitch/PitchFormation";
import type { SquadPlayer } from "@/shared/types/api";

function toPitchPlayer(p: SquadPlayer): PitchPlayer {
  return {
    id: p.id,
    name: p.web_name,
    position: p.pos,
    teamShort: p.team_short,
    photo: p.player_photo,
    teamKit: p.team_kit,
    isCaptain: p.captain_flag === "(C)",
    isViceCaptain: p.captain_flag === "(VC)",
    subtitle: p.next_opponent,
    href: p.live_id != null ? `/players/${p.live_id}` : undefined,
  };
}

/** The starting XI laid out on the pitch, with the four-man bench beneath it. */
export function SquadPitch({ squad }: { squad: SquadPlayer[] }) {
  return (
    <div>
      <PitchFormation players={squad.filter((p) => p.role === "Starting XI").map(toPitchPlayer)} />
      <div className="mt-3 flex flex-wrap justify-center gap-4 rounded-lg border border-border bg-surface-sunken px-4 py-3">
        <span className="w-full text-center text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:w-auto sm:text-left">
          Bench
        </span>
        {squad
          .filter((p) => p.role !== "Starting XI")
          .map((p) => (
            <PlayerLink key={p.id} id={p.live_id} className="flex flex-col items-center gap-1 text-center">
              <PlayerPhoto
                src={p.player_photo}
                name={p.web_name}
                className="h-10 w-10 rounded-full border-2 border-border-strong bg-white object-cover object-top text-[10px]"
              />
              <span className="whitespace-nowrap text-[11px] font-medium text-text-primary">{p.web_name}</span>
            </PlayerLink>
          ))}
      </div>
    </div>
  );
}
