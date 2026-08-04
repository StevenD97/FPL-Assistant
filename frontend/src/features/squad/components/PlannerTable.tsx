import { Alert } from "@/shared/ui/Alert";
import { Card } from "@/shared/ui/Card";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { GameweekStrip } from "./GameweekStrip";
import { TransferSuggestions } from "./TransferSuggestions";
import type { PlannerResponse, PlayerTrajectory, Position, SquadPlayer } from "@/shared/types/api";

// Same hues as the position badge elsewhere on the page, as a left-border
// accent - the matrix is dense enough that a plain grey rule per row reads
// as noise; this at least separates a defender's row from a forward's.
const POSITION_BORDER: Record<Position, string> = {
  GKP: "border-l-pos-gkp",
  DEF: "border-l-pos-def",
  MID: "border-l-pos-mid",
  FWD: "border-l-pos-fwd",
};

/**
 * Predicted points per gameweek for the whole squad, one row per player.
 *
 * Swapping a player here uses the same picker as everywhere else (the
 * pitch icon, Squad detail's "Swap") - previewed on this row's trajectory,
 * and everywhere else this squad is shown, via the shared swapPreviews
 * state (see useSwapPreview). Nothing here reaches the FPL API; it's a
 * local, unsaved preview. Each row can be reverted on its own, or all at
 * once.
 */
export function PlannerTable({
  planner,
  loading,
  error,
  squad,
  bank,
  swapPreviews,
  swapLoading,
  onReplace,
  onUndoSwap,
  onResetSwaps,
}: {
  planner: PlannerResponse | null;
  loading: boolean;
  error: string | null;
  squad: SquadPlayer[];
  /** Already net of any active swap previews - see SquadPitch's `bank` doc. */
  bank: number;
  swapPreviews: Record<number, PlayerTrajectory>;
  swapLoading: Record<number, boolean>;
  onReplace: (originalLiveId: number, candidateId: number, candidateCost: number) => void;
  onUndoSwap: (originalPlayerId: number) => void;
  onResetSwaps: () => void;
}) {
  const pendingCount = Object.keys(swapPreviews).length;
  // What's already owned (including anyone already previewed in elsewhere)
  // can't also be offered as a replacement - excluded by live id.
  const excludeIds = squad
    .map((p) => (p.live_id != null ? (swapPreviews[p.live_id]?.id ?? p.live_id) : null))
    .filter((id): id is number => id != null);
  const costByLiveId = new Map(squad.filter((p) => p.live_id != null).map((p) => [p.live_id as number, p.cost]));

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border p-4">
        <div>
          <h3 className="font-semibold text-text-primary">Transfer planner</h3>
          <p className="mt-1 text-xs text-text-muted">
            Predicted points per gameweek for your squad, with risky weeks flagged - tough fixtures, blanks,
            or rotation risk. Hover a flagged cell for why, or swap a player from a row to preview the effect
            across the whole window - it isn&apos;t submitted to FPL, just previewed here and everywhere else
            this squad is shown.
          </p>
        </div>
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={onResetSwaps}
            className="shrink-0 whitespace-nowrap text-xs font-semibold text-pl-purple hover:underline"
          >
            Reset all ({pendingCount})
          </button>
        )}
      </div>
      {loading && <p className="p-4 text-sm text-text-muted">Building planner...</p>}
      {error && (
        <div className="p-4">
          <Alert kind="warning">Couldn&apos;t build the planner ({error}).</Alert>
        </div>
      )}
      {/* The shape of the window before the detail of it: which weeks are thin or
          doubled is a chip-timing question, and answering it from the matrix below
          means reading 15 rows of numbers. The strip answers it at a glance and
          the table stays the place you go for why. */}
      {planner && (
        <div className="border-b border-border px-4 py-3">
          <GameweekStrip planner={planner} />
        </div>
      )}
      {planner && (
        <div className="overflow-x-auto">
          {/* A matrix: the read is "which gameweek is thin for this player", i.e.
              scanning across a row and down a column. `table-dense` shrinks the
              grid to fit a phone rather than collapsing or clipping it. */}
          <table className="table-dense w-full text-left text-sm">
            <thead className="bg-surface-sunken">
              <tr>
                <th className="sticky left-0 bg-surface-sunken px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Player
                </th>
                {planner.next_events.map((gw) => (
                  <th
                    key={gw}
                    className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-text-muted"
                  >
                    GW{gw}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {planner.players.map((original) => {
                const preview = swapPreviews[original.id];
                const display = preview ?? original;
                const isPreviewing = preview != null;
                return (
                  <tr
                    key={original.id}
                    className={`border-t border-border transition-colors duration-fast ease-standard ${
                      isPreviewing ? "bg-pl-purple/5" : ""
                    }`}
                  >
                    <td
                      className={`sticky left-0 whitespace-nowrap border-l-4 bg-white px-3 py-2 font-medium ${POSITION_BORDER[display.position]}`}
                    >
                      <div className="flex items-center gap-2">
                        <PlayerLink id={display.id} className="flex items-center gap-2">
                          <PlayerPhoto
                            src={display.player_photo}
                            name={display.web_name}
                            className="h-7 w-7 rounded-full border border-border-strong bg-surface-sunken object-cover object-top text-[8px]"
                          />
                          <span>
                            <span className="block">{display.web_name}</span>
                            <TeamBadge teamShort={display.team_short} name={display.team_short} badgeUrl={display.team_badge} />
                          </span>
                        </PlayerLink>
                        {swapLoading[original.id] && (
                          <span className="text-xs text-text-muted">loading...</span>
                        )}
                        {isPreviewing ? (
                          <button
                            onClick={() => onUndoSwap(original.id)}
                            className="rounded-sm border border-pl-purple/40 px-1.5 py-0.5 text-[10px] font-semibold text-pl-purple hover:bg-pl-purple/10"
                            title={`Stop previewing - show ${original.web_name} again`}
                          >
                            ↩ was {original.web_name}
                          </button>
                        ) : (
                          <TransferSuggestions
                            playerId={original.id}
                            playerName={original.web_name}
                            maxCost={bank + (costByLiveId.get(original.id) ?? 0)}
                            excludeIds={excludeIds}
                            onSelect={(candidateId, candidate) =>
                              onReplace(original.id, candidateId, candidate.cost)
                            }
                            trigger="Swap"
                            triggerClassName="shrink-0 text-[10px] font-semibold text-pl-purple hover:underline"
                          />
                        )}
                      </div>
                    </td>
                    {display.trajectory.map((gw) => {
                      const hasBlank = gw.fixture_count === 0;
                      const hasFlag = gw.flags.length > 0;
                      const bg = hasBlank ? "bg-danger-bg" : hasFlag ? "bg-warning-bg" : "";
                      return (
                        <td
                          key={gw.event}
                          className={`px-3 py-2 text-center font-mono ${bg} ${hasFlag ? "cursor-help" : ""}`}
                          title={gw.flags.length > 0 ? gw.flags.join(" · ") : undefined}
                        >
                          {gw.predicted_points.toFixed(1)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
