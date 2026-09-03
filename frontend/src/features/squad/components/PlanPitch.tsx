"use client";

import { PitchFormation, type PitchPlayer } from "@/shared/pitch/PitchFormation";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { teamColorVar } from "@/shared/lib/teamColors";
import type { PlanCell, SlotRow } from "../lib/transferPlan";

/**
 * A player's week in one line: who they play, home or away. This is the
 * "information next to the player" that a separate league-wide fixture
 * table could never give you - it's about *your* squad, in *this* week.
 *
 * A double gameweek gets both fixtures; a blank says so outright, since an
 * empty subtitle would read as missing data rather than a missing match.
 */
function fixtureLine(cell: PlanCell): string {
  if (cell.opponents.length === 0) return "no fixture";
  return cell.opponents.map((o) => `${o.team}(${o.is_home ? "H" : "A"})`).join(" + ");
}

/** Worst (highest) difficulty across the week's fixtures - what sets the tone. */
function hardestDifficulty(cell: PlanCell): number | null {
  if (cell.opponents.length === 0) return null;
  return Math.max(...cell.opponents.map((o) => o.difficulty));
}

/**
 * FPL's own fixture-difficulty colours, as used by FdrChip - but applied to
 * a pill sitting on the dark pitch, so the light tints there would vanish.
 * Only the ends of the scale are tinted: a 3 is unremarkable and shouldn't
 * compete for attention on a pitch of 15 players.
 */
function difficultyClass(difficulty: number | null, isBlank: boolean): string {
  if (isBlank) return "bg-danger text-white";
  if (difficulty == null) return "bg-ink-900/20 text-white";
  if (difficulty >= 5) return "bg-danger text-white";
  if (difficulty === 4) return "bg-danger/70 text-white";
  if (difficulty <= 2) return "bg-success text-white";
  return "bg-ink-900/25 text-white";
}

function toPitchPlayer(row: SlotRow, cell: PlanCell): PitchPlayer {
  return {
    id: row.outLiveId,
    name: cell.occupant.web_name,
    position: cell.occupant.position,
    teamShort: cell.occupant.team_short,
    photo: cell.occupant.player_photo,
    subtitle: fixtureLine(cell),
    subtitleClassName: difficultyClass(hardestDifficulty(cell), cell.fixtureCount === 0),
    // The purple ring already means "this slot is holding a planned
    // transfer rather than who you own" everywhere else in this feature.
    swapped: !cell.isOriginalOccupant,
  };
}

/**
 * The squad as it stands in one specific gameweek, with every planned
 * transfer up to that week already applied - step forward through the bar
 * above and the pitch rebuilds itself, so a plan is something you watch
 * play out rather than read off a list.
 *
 * Tapping a player plans a transfer *for the selected week*, replacing
 * whoever is in that slot by then.
 */
export function PlanPitch({
  slotRows,
  event,
  onPlanTransfer,
}: {
  slotRows: SlotRow[];
  event: number;
  onPlanTransfer: (outLiveId: number) => void;
}) {
  const withCell = slotRows
    .map((row) => ({ row, cell: row.cells.find((c) => c.event === event) }))
    .filter((x): x is { row: SlotRow; cell: PlanCell } => x.cell != null);

  const starters = withCell.filter((x) => x.row.role === "Starting XI");
  const bench = withCell.filter((x) => x.row.role !== "Starting XI");

  return (
    <div>
      <PitchFormation
        players={starters.map((x) => toPitchPlayer(x.row, x.cell))}
        onPlayerClick={onPlanTransfer}
        playerClickLabel={(name) => `Plan a transfer to replace ${name} in GW${event}`}
        renderTransfer={(p) => {
          const match = withCell.find((x) => x.row.outLiveId === p.id);
          if (!match) return null;
          const isBlank = match.cell.fixtureCount === 0;
          const difficulty = hardestDifficulty(match.cell);
          // Only the exceptions get a marker - a routine fixture says
          // nothing here, it's already spelled out in the subtitle.
          if (!isBlank && (difficulty == null || difficulty < 4)) return null;
          return (
            <span
              className={`flex size-5 items-center justify-center rounded-full text-xs font-bold shadow ring-2 ring-white ${
                isBlank ? "bg-danger text-white" : "bg-warning text-white"
              }`}
              title={
                match.cell.flags.length > 0
                  ? match.cell.flags.join(" · ")
                  : isBlank
                    ? "No fixture this gameweek"
                    : `Tough fixture (FDR ${difficulty})`
              }
            >
              {isBlank ? "0" : "!"}
            </span>
          );
        }}
      />

      <div className="mt-3 rounded-lg border border-border bg-surface-sunken px-4 py-3">
        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-text-muted sm:text-left">
          Bench
        </p>
        <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
          {bench.map(({ row, cell }) => {
            const isBlank = cell.fixtureCount === 0;
            const difficulty = hardestDifficulty(cell);
            return (
              <button
                key={row.outLiveId}
                type="button"
                onClick={() => onPlanTransfer(row.outLiveId)}
                aria-label={`Plan a transfer to replace ${cell.occupant.web_name} in GW${event}`}
                className="flex flex-col items-center gap-1 text-center transition-transform duration-fast ease-standard hover:scale-105"
              >
                <PlayerPhoto
                  src={cell.occupant.player_photo}
                  name={cell.occupant.web_name}
                  className={`size-10 rounded-full border-2 bg-surface object-cover object-top text-xs ${
                    cell.isOriginalOccupant ? "" : "ring-4 ring-brand ring-offset-2"
                  }`}
                  style={{ borderColor: teamColorVar(cell.occupant.team_short) }}
                />
                <span className="whitespace-nowrap text-xs font-medium text-text-primary">
                  {cell.occupant.web_name}
                </span>
                <span
                  className={`whitespace-nowrap rounded-sm px-1.5 py-0.5 font-mono text-xs ${difficultyClass(
                    difficulty,
                    isBlank,
                  )}`}
                >
                  {fixtureLine(cell)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
