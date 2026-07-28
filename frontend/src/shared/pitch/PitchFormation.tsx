import Link from "next/link";
import { teamColorVar } from "@/shared/lib/teamColors";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import type { Position } from "@/shared/types/api";

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

// Row index by position, and its inverse so empty-slot placeholders know which
// position row they belong to.
const ROWS: Record<Position, number> = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };
const ROW_POSITION: Position[] = ["GKP", "DEF", "MID", "FWD"];
// Every cell (filled player or empty slot) reserves the same footprint - a
// player adds a name + subtitle line an empty slot doesn't, so without a fixed
// height the pitch would grow as you fill it. Photo is h-12/h-16; the rest of
// the box holds the labels.
const CELL = "flex h-[96px] flex-col items-center gap-1 sm:h-[112px]";

export function PitchFormation({
  players,
  emptyByPosition,
  onPlayerClick,
  onRemove,
  onSlotClick,
}: {
  players: PitchPlayer[];
  /** Render N dashed placeholder slots per position (the build-a-squad template). */
  emptyByPosition?: Partial<Record<Position, number>>;
  /** If set, clicking a player invokes this instead of following `href`. */
  onPlayerClick?: (id: number) => void;
  /** If set, each player shows a small × remove control. */
  onRemove?: (id: number) => void;
  /** If set, clicking an empty placeholder slot invokes this with its position. */
  onSlotClick?: (position: Position) => void;
}) {
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

      {[3, 2, 1, 0].map((row) => {
        const pos = ROW_POSITION[row];
        const empties = emptyByPosition?.[pos] ?? 0;
        return (
          <div key={row} className="z-[1] flex flex-wrap items-start justify-center gap-3 sm:gap-6">
            {byRow[row].map((p) => (
              <PitchPlayerCard key={p.id} player={p} onPlayerClick={onPlayerClick} onRemove={onRemove} />
            ))}
            {Array.from({ length: empties }).map((_, i) => (
              <EmptySlot key={`empty-${pos}-${i}`} position={pos} onClick={onSlotClick} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function EmptySlot({ position, onClick }: { position: Position; onClick?: (position: Position) => void }) {
  const inner = (
    <>
      <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-white/45 bg-white/5 text-[10px] font-bold text-white/70 transition-colors group-hover:border-pl-green group-hover:bg-white/10 sm:h-16 sm:w-16 sm:text-xs">
        {position}
      </span>
      <span className="whitespace-nowrap rounded-sm bg-white/[0.14] px-2 py-0.5 text-[11px] font-medium text-white/70">
        Add {position}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={() => onClick(position)} className={`group ${CELL}`} aria-label={`Add a ${position}`}>
        {inner}
      </button>
    );
  }
  return <div className={`group ${CELL}`}>{inner}</div>;
}

function PitchPlayerCard({
  player: p,
  onPlayerClick,
  onRemove,
}: {
  player: PitchPlayer;
  onPlayerClick?: (id: number) => void;
  onRemove?: (id: number) => void;
}) {
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
    <div className={`relative ${CELL}`}>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(p.id)}
          aria-label={`Remove ${p.name}`}
          className="absolute -right-1 -top-1 z-[2] flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow ring-2 ring-white transition-transform hover:scale-110"
        >
          ×
        </button>
      )}
      {onPlayerClick ? (
        <button
          type="button"
          onClick={() => onPlayerClick(p.id)}
          className="transition-transform duration-fast ease-standard hover:scale-105"
          aria-label={`View ${p.name}'s stats`}
        >
          {badge}
        </button>
      ) : p.href ? (
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
