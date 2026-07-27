import Link from "next/link";
import { teamColorVar } from "@/lib/teamColors";
import { PlayerPhoto } from "@/components/ui/PlayerPhoto";

type Position = "GKP" | "DEF" | "MID" | "FWD";

export type PitchPlayer = {
  id: number;
  name: string;
  position: Position;
  teamShort: string;
  photo?: string;
  teamKit?: string;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  // Small line under the name - e.g. predicted points or next opponent.
  subtitle?: string;
  // If set, the player's badge/photo becomes a link (e.g. to their detail page).
  href?: string;
};

const ROWS: Record<Position, number> = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };

export function PitchFormation({ players }: { players: PitchPlayer[] }) {
  const byRow: Record<number, PitchPlayer[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const p of players) byRow[ROWS[p.position]].push(p);

  return (
    <div className="bg-fpl-pitch relative flex min-h-[480px] flex-col justify-between gap-5 overflow-hidden rounded-lg px-3 py-8 sm:px-6 sm:gap-6">
      {/* Pitch markings */}
      <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-white/25" />
      <div className="pointer-events-none absolute left-4 right-4 top-1/2 -translate-y-1/2 border-t-2 border-white/25" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25 sm:h-28 sm:w-28" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" />
      <div className="pointer-events-none absolute left-1/2 top-4 h-14 w-36 -translate-x-1/2 border-2 border-t-0 border-white/25 sm:h-20 sm:w-56" />
      <div className="pointer-events-none absolute bottom-4 left-1/2 h-14 w-36 -translate-x-1/2 border-2 border-b-0 border-white/25 sm:h-20 sm:w-56" />

      {[3, 2, 1, 0].map((row) => (
        <div key={row} className="z-[1] flex flex-wrap justify-center gap-3 sm:gap-6">
          {byRow[row].map((p) => (
            <PitchPlayerCard key={p.id} player={p} />
          ))}
        </div>
      ))}
    </div>
  );
}

function PitchPlayerCard({ player: p }: { player: PitchPlayer }) {
  const badge = (
    <div className="relative">
      <PlayerPhoto
        src={p.photo}
        name={p.name}
        className="h-12 w-12 rounded-full border-[3px] bg-white object-cover object-top text-[11px] shadow-md sm:h-16 sm:w-16 sm:text-sm"
        style={{ borderColor: teamColorVar(p.teamShort) }}
      />
      {p.teamKit && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.teamKit}
          alt={p.teamShort}
          className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border border-white bg-white object-contain shadow sm:h-6 sm:w-6"
        />
      )}
      {(p.isCaptain || p.isViceCaptain) && (
        <span className="absolute -left-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-pl-green text-[10px] font-bold text-pl-purple shadow sm:h-5 sm:w-5">
          {p.isCaptain ? "C" : "V"}
        </span>
      )}
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-1">
      {p.href ? (
        <Link href={p.href} className="transition-transform duration-fast ease-standard hover:scale-105">
          {badge}
        </Link>
      ) : (
        badge
      )}
      <span className="whitespace-nowrap rounded-sm bg-white/[0.92] px-2 py-0.5 text-[11px] font-medium text-text-primary">
        {p.name}
      </span>
      {p.subtitle && (
        <span className="whitespace-nowrap rounded-sm bg-black/20 px-1.5 py-0.5 text-[10px] font-mono text-white">
          {p.subtitle}
        </span>
      )}
    </div>
  );
}
