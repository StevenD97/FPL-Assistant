"use client";

import { useCallback, useState } from "react";
import type { PlannerResponse, PlayerTrajectory } from "@/shared/types/api";
import { getTrajectory } from "../api";

/**
 * "What would this player's next few gameweeks look like in that slot?" - drag a
 * replacement chip onto a planner row and the row re-renders with the
 * candidate's trajectory, without making a real transfer.
 *
 * Keyed by the original squad player's id, i.e. the slot being previewed, so a
 * row can be reverted independently of the others.
 */
export function useSwapPreview(planner: PlannerResponse | null) {
  const [previews, setPreviews] = useState<Record<number, PlayerTrajectory>>({});
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  const [dragOverRow, setDragOverRow] = useState<number | null>(null);

  const drop = useCallback(
    async (originalPlayerId: number, e: React.DragEvent) => {
      e.preventDefault();
      setDragOverRow(null);
      const candidateId = Number(e.dataTransfer.getData("text/plain"));
      if (!candidateId || !planner) return;
      setLoading((prev) => ({ ...prev, [originalPlayerId]: true }));
      try {
        const row = await getTrajectory(candidateId, {
          gw_count: planner.next_events.length,
          next_event: planner.next_events[0],
        });
        setPreviews((prev) => ({ ...prev, [originalPlayerId]: row }));
      } catch {
        // Dropping an invalid or unfetchable candidate does nothing - not worth
        // a page-level error.
      } finally {
        setLoading((prev) => ({ ...prev, [originalPlayerId]: false }));
      }
    },
    [planner],
  );

  const undo = useCallback((originalPlayerId: number) => {
    setPreviews((prev) => {
      const next = { ...prev };
      delete next[originalPlayerId];
      return next;
    });
  }, []);

  return { previews, loading, dragOverRow, setDragOverRow, drop, undo };
}
