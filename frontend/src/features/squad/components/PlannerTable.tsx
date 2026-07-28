import { Alert } from "@/shared/ui/Alert";
import { Card } from "@/shared/ui/Card";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import type { PlannerResponse, PlayerTrajectory } from "@/shared/types/api";

/**
 * Predicted points per gameweek for the whole squad, one row per player.
 *
 * Rows are a drop target: dragging a replacement chip onto one swaps in that
 * candidate's trajectory so you can compare without making a transfer. The
 * previewed row is keyed by the original player's id, so each can be reverted
 * on its own.
 */
export function PlannerTable({
  planner,
  loading,
  error,
  swapPreviews,
  swapLoading,
  dragOverRow,
  setDragOverRow,
  onSwapDrop,
  onUndoSwap,
}: {
  planner: PlannerResponse | null;
  loading: boolean;
  error: string | null;
  swapPreviews: Record<number, PlayerTrajectory>;
  swapLoading: Record<number, boolean>;
  dragOverRow: number | null;
  setDragOverRow: React.Dispatch<React.SetStateAction<number | null>>;
  onSwapDrop: (originalPlayerId: number, e: React.DragEvent) => void;
  onUndoSwap: (originalPlayerId: number) => void;
}) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="border-b border-border p-4">
        <h3 className="font-semibold text-text-primary">Transfer planner</h3>
        <p className="mt-1 text-xs text-text-muted">
          Predicted points per gameweek for your squad, with risky weeks flagged - tough fixtures, blanks,
          or rotation risk. Hover a flagged cell for why, or drag a replacement chip onto a row to preview
          a swap.
        </p>
      </div>
      {loading && <p className="p-4 text-sm text-text-muted">Building planner...</p>}
      {error && (
        <div className="p-4">
          <Alert kind="warning">Couldn&apos;t build the planner ({error}).</Alert>
        </div>
      )}
      {planner && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
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
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverRow(original.id);
                    }}
                    onDragLeave={() => setDragOverRow((cur) => (cur === original.id ? null : cur))}
                    onDrop={(e) => onSwapDrop(original.id, e)}
                    className={`border-t border-border transition-colors duration-fast ease-standard ${
                      isPreviewing ? "bg-pl-purple/5" : ""
                    } ${dragOverRow === original.id ? "outline outline-2 -outline-offset-2 outline-pl-purple" : ""}`}
                  >
                    <td className="sticky left-0 whitespace-nowrap bg-white px-3 py-2 font-medium">
                      <div className="flex items-center gap-2">
                        <PlayerLink id={display.id} className="flex items-center gap-2">
                          <PlayerPhoto
                            src={display.player_photo}
                            name={display.web_name}
                            className="h-7 w-7 rounded-full border border-border-strong bg-surface-sunken object-cover object-top text-[8px]"
                          />
                          <span>
                            {display.web_name} <span className="text-text-muted">({display.team_short})</span>
                          </span>
                        </PlayerLink>
                        {swapLoading[original.id] && (
                          <span className="text-xs text-text-muted">loading...</span>
                        )}
                        {isPreviewing && (
                          <button
                            onClick={() => onUndoSwap(original.id)}
                            className="rounded-sm border border-pl-purple/40 px-1.5 py-0.5 text-[10px] font-semibold text-pl-purple hover:bg-pl-purple/10"
                            title={`Stop previewing - show ${original.web_name} again`}
                          >
                            ↩ was {original.web_name}
                          </button>
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
                          className={`px-3 py-2 text-center font-mono ${bg}`}
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
