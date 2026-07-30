import { PlayerLink } from "@/shared/ui/PlayerLink";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { PitchFormation, type PitchPlayer } from "@/shared/pitch/PitchFormation";
import { TransferSuggestions } from "./TransferSuggestions";
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
export function SquadPitch({
  squad,
  bank,
  onReplace,
}: {
  squad: SquadPlayer[];
  bank: number;
  /** Previews swapping `candidateId` into `originalPlayerId`'s slot (see useSwapPreview). */
  onReplace: (originalPlayerId: number, candidateId: number) => void;
}) {
  const squadById = new Map(squad.map((p) => [p.id, p]));
  // What's already owned can't also be a "replacement" - excluded by live id
  // (the id-space player_alternatives itself works in).
  const excludeIds = squad.map((p) => p.live_id).filter((id): id is number => id != null);

  function transferIcon(p: SquadPlayer) {
    if (p.live_id == null) return null;
    const liveId = p.live_id;
    return (
      <TransferSuggestions
        playerId={liveId}
        playerName={p.web_name}
        maxCost={bank + p.cost}
        excludeIds={excludeIds}
        onSelect={(candidateId) => onReplace(liveId, candidateId)}
        triggerClassName="h-5 w-5"
      />
    );
  }

  return (
    <div>
      <PitchFormation
        players={squad.filter((p) => p.role === "Starting XI").map(toPitchPlayer)}
        renderTransfer={(p) => {
          const sp = squadById.get(p.id);
          return sp ? transferIcon(sp) : null;
        }}
      />
      <div className="mt-3 flex flex-wrap justify-center gap-4 rounded-lg border border-border bg-surface-sunken px-4 py-3">
        <span className="w-full text-center text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:w-auto sm:text-left">
          Bench
        </span>
        {squad
          .filter((p) => p.role !== "Starting XI")
          .map((p) => (
            <div key={p.id} className="relative flex flex-col items-center gap-1">
              <div className="absolute -right-1 -top-1 z-[2]">{transferIcon(p)}</div>
              <PlayerLink id={p.live_id} className="flex flex-col items-center gap-1 text-center">
                <PlayerPhoto
                  src={p.player_photo}
                  name={p.web_name}
                  className="h-10 w-10 rounded-full border-2 border-border-strong bg-white object-cover object-top text-[10px]"
                />
                <span className="whitespace-nowrap text-[11px] font-medium text-text-primary">{p.web_name}</span>
              </PlayerLink>
            </div>
          ))}
      </div>
    </div>
  );
}
