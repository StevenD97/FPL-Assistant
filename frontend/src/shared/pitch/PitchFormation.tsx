import Link from "next/link";
import { teamColorVar } from "@/shared/lib/teamColors";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import type { Position } from "@/shared/types/api";

/**
 * One-shot confirmation feedback on a player card.
 *
 * - `"ring"` - an expanding ring. For a player who was already here and changed
 *   state (a substitution): the card stays put, so the feedback has to be added
 *   around it.
 * - `"pop"` - a scale-in. For a player who has just arrived (added to a draft),
 *   where the card itself is the new thing.
 */
export type PitchBurst = "ring" | "pop";

const BURST_CLASS: Record<PitchBurst, string> = {
  ring: "animate-fpl-ring",
  pop: "animate-fpl-pop",
};

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
  /**
   * Replaces the subtitle pill's default dark tint. For a subtitle that
   * carries meaning in its colour rather than just its text - the transfer
   * plan tints it by fixture difficulty, so a hard week reads off the pitch
   * without being read.
   */
  subtitleClassName?: string;
  // If set, the player's badge/photo becomes a link (e.g. to their detail page).
  href?: string;
  // Highlight ring - e.g. picked as the subject of a pending substitution.
  selected?: boolean;
  /**
   * Fire one-shot confirmation feedback. Set this for a beat after the player
   * changes, then clear it - the caller owns the timer, because removing and
   * re-adding the class is what lets the animation replay on a second change.
   * See `useFormationEditor.justSwappedIds`.
   */
  burst?: PitchBurst;
  // Highlight ring (a different color from `selected`) - this slot holds a
  // previewed transfer candidate rather than the manager's real player.
  swapped?: boolean;
};

/**
 * Row index by position, and its inverse so empty-slot placeholders know which
 * position row they belong to.
 */
const ROWS: Record<Position, number> = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };
const ROW_POSITION: Position[] = ["GKP", "DEF", "MID", "FWD"];

/**
 * The pitch sizes itself against its own width (`@container/pitch`), not the
 * viewport.
 *
 * It renders in four places at four different widths - the home cockpit, the
 * squad workspace, the optimizer result and the squad builder - so viewport
 * breakpoints were always answering the wrong question: at 1280px wide the
 * viewport is "large" but a pitch inside a two-column layout may only have
 * 420px to work with, and it was picking the large kit sizes anyway.
 *
 * Sizes below interpolate with `cqw` and clamp to the same endpoints the old
 * fixed breakpoints used (48 -> 64px photos, 96 -> 112px cells), so the two ends
 * of the range look as they did before - it's the middle that's new, and it now
 * tracks the container instead of the window.
 *
 * `container-type: inline-size` rather than `size`: `size` containment would
 * stop the pitch being sized by its own content, and these rows set their own
 * height. That rules out `cqh`, so every value here interpolates on width only.
 *
 * The container is a bare wrapper *around* the pitch surface, not the surface
 * itself, because an element cannot query its own container - `cqw` on the
 * declaring element silently falls back to the next container out (or the
 * viewport), which pins every value to the end of its clamp. The wrapper is a
 * plain full-width block, so `cqw` inside it means "percent of the pitch's own
 * width", which is what the sizes below are written against.
 */
const PITCH_CONTAINER = "@container/pitch";

/**
 * Every cell (filled player or empty slot) reserves the same footprint - a
 * player adds a name + subtitle line an empty slot doesn't, so without a fixed
 * height the pitch would grow as you fill it.
 */
const CELL = "flex h-[clamp(6rem,22cqw,7rem)] flex-col items-center gap-1";

/** Photo / placeholder disc: 48px until the pitch is ~384px wide, 64px by ~512px. */
const DISC = "size-[clamp(3rem,12.5cqw,4rem)]";

export function PitchFormation({
  players,
  emptyByPosition,
  onPlayerClick,
  playerClickLabel,
  onRemove,
  onSlotClick,
  renderTransfer,
  inset = false,
}: {
  players: PitchPlayer[];
  /** Render N dashed placeholder slots per position (the build-a-squad template). */
  emptyByPosition?: Partial<Record<Position, number>>;
  /** If set, clicking a player invokes this instead of following `href`. */
  onPlayerClick?: (id: number) => void;
  /** Accessible label for the `onPlayerClick` button - callers give this a verb matching what the click actually does (view stats, select for a substitution, ...). */
  playerClickLabel?: (name: string) => string;
  /** If set, each player shows a small × remove control. */
  onRemove?: (id: number) => void;
  /** If set, clicking an empty placeholder slot invokes this with its position. */
  onSlotClick?: (position: Position) => void;
  /**
   * If set, each player card renders this in its top-right corner - the
   * transfer-suggestions icon. Not meant to be combined with `onRemove`
   * (same corner); callers only ever pass one or the other.
   */
  renderTransfer?: (player: PitchPlayer) => React.ReactNode;
  /**
   * Extra clearance between the outer rows and the penalty boxes.
   *
   * The row padding already scales with the pitch, so both contexts stay clear
   * of the markings on their own. This is the remaining *taste* difference: the
   * home cockpit is a summary and wants the team held in tighter, away from the
   * edge; the squad workspace is a workspace and wants the rows spread over the
   * full pitch. It's no longer compensating for a size the component couldn't
   * see.
   */
  inset?: boolean;
}) {
  const byRow: Record<number, PitchPlayer[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const p of players) byRow[ROWS[p.position]].push(p);

  return (
    <div className={PITCH_CONTAINER}>
      {/* `min-h` stays a fixed 480px rather than scaling with the container. The
          interior (kits, markings, gaps) is what needed to follow the container;
          the pitch's *height* is the canvas those sit on, and making it fluid
          only took height away - a 549px-wide workspace pitch lost ~50px of
          vertical room for no gain. */}
      <div
        className={`bg-fpl-pitch relative flex min-h-[480px] flex-col justify-between gap-[clamp(1.25rem,4.6cqw,1.5rem)] overflow-hidden rounded-lg px-[clamp(0.75rem,4.6cqw,1.5rem)] ${
          inset ? "py-[clamp(3.5rem,13cqw,4rem)]" : "py-[clamp(1.5rem,6cqw,2rem)]"
        }`}
      >
        {/* Pitch markings. These scale with the pitch too - at the old fixed sizes
            a narrow pitch got full-size penalty boxes, which is what pushed the
            outer rows onto the markings in the first place. */}
        <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-white/25" />
        <div className="pointer-events-none absolute left-4 right-4 top-1/2 -translate-y-1/2 border-t-2 border-white/25" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 size-[clamp(5rem,21.5cqw,7rem)] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface/40" />
        <div className="pointer-events-none absolute left-1/2 top-4 h-[clamp(3.5rem,15.4cqw,5rem)] w-[clamp(9rem,43cqw,14rem)] -translate-x-1/2 border-2 border-t-0 border-white/25" />
        <div className="pointer-events-none absolute bottom-4 left-1/2 h-[clamp(3.5rem,15.4cqw,5rem)] w-[clamp(9rem,43cqw,14rem)] -translate-x-1/2 border-2 border-b-0 border-white/25" />

        {[3, 2, 1, 0].map((row) => {
          const pos = ROW_POSITION[row];
          const empties = emptyByPosition?.[pos] ?? 0;
          return (
            <div
              key={row}
              className="z-[1] flex flex-wrap items-start justify-center gap-[clamp(0.75rem,4.6cqw,1.5rem)]"
            >
              {byRow[row].map((p) => (
                <PitchPlayerCard
                  key={p.id}
                  player={p}
                  onPlayerClick={onPlayerClick}
                  playerClickLabel={playerClickLabel}
                  onRemove={onRemove}
                  transfer={renderTransfer?.(p)}
                />
              ))}
              {Array.from({ length: empties }).map((_, i) => (
                <EmptySlot key={`empty-${pos}-${i}`} position={pos} onClick={onSlotClick} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptySlot({ position, onClick }: { position: Position; onClick?: (position: Position) => void }) {
  const inner = (
    <>
      <span
        className={`${DISC} flex items-center justify-center rounded-full border-2 border-dashed border-white/45 bg-surface/5 text-xs font-bold text-white/70 transition-colors group-hover:border-brand group-hover:bg-surface/10 @[520px]/pitch:text-xs`}
      >
        {position}
      </span>
      <span className="whitespace-nowrap rounded-sm bg-surface/[0.14] px-2 py-0.5 text-xs font-medium text-white/70">
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
  playerClickLabel,
  onRemove,
  transfer,
}: {
  player: PitchPlayer;
  onPlayerClick?: (id: number) => void;
  playerClickLabel?: (name: string) => string;
  onRemove?: (id: number) => void;
  transfer?: React.ReactNode;
}) {
  const badge = (
    <div
      className={`relative rounded-full ${
        p.selected ? "ring-4 ring-brand ring-offset-2" : p.swapped ? "ring-4 ring-brand ring-offset-2" : ""
      } ${p.burst ? BURST_CLASS[p.burst] : ""}`}
    >
      <PlayerPhoto
        src={p.photo}
        name={p.name}
        className={`${DISC} rounded-full border-[3px] bg-surface object-cover object-top text-xs shadow-md @[520px]/pitch:text-sm`}
        style={{ borderColor: teamColorVar(p.teamShort) }}
      />
      {p.teamKit && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.teamKit}
          alt={p.teamShort}
          className="absolute -bottom-1 -right-1 size-[clamp(1.25rem,4.6cqw,1.5rem)] rounded-full border border-white bg-surface object-contain shadow"
        />
      )}
      {(p.isCaptain || p.isViceCaptain) && (
        <span className="absolute -left-1 -top-1 flex size-[clamp(1.125rem,3.85cqw,1.25rem)] items-center justify-center rounded-full bg-brand text-xs font-bold text-ink-900 shadow">
          {p.isCaptain ? "C" : "V"}
        </span>
      )}
    </div>
  );

  const content = (
    <>
      {badge}
      <span className="whitespace-nowrap rounded-sm bg-surface/[0.92] px-2 py-0.5 text-xs font-medium text-text-primary">
        {p.name}
      </span>
      {p.subtitle && (
        <span
          className={`whitespace-nowrap rounded-sm px-1.5 py-0.5 font-mono text-xs ${
            p.subtitleClassName ?? "bg-ink-900/20 text-white"
          }`}
        >
          {p.subtitle}
        </span>
      )}
    </>
  );

  return (
    <div className={`relative ${CELL}`}>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(p.id)}
          aria-label={`Remove ${p.name}`}
          className="absolute -right-1 -top-1 z-[2] flex size-5 items-center justify-center rounded-full bg-danger text-white shadow ring-2 ring-white transition-transform hover:scale-110"
        >
          ×
        </button>
      )}
      {/* Shares the top-right corner with onRemove when neither is present
          alongside a captain badge (BuildSquadPanel's draft never shows
          one), so it moves to top-left instead when onRemove is active. */}
      {transfer && (
        <div className={`absolute z-[2] ${onRemove ? "-left-1 -top-1" : "-right-1 -top-1"}`}>{transfer}</div>
      )}
      {onPlayerClick ? (
        <button
          type="button"
          onClick={() => onPlayerClick(p.id)}
          className="flex flex-col items-center gap-1 transition-transform duration-fast ease-standard hover:scale-105"
          aria-label={playerClickLabel ? playerClickLabel(p.name) : `View ${p.name}'s stats`}
        >
          {content}
        </button>
      ) : p.href ? (
        <Link
          href={p.href}
          className="flex flex-col items-center gap-1 transition-transform duration-fast ease-standard hover:scale-105"
        >
          {content}
        </Link>
      ) : (
        content
      )}
    </div>
  );
}
