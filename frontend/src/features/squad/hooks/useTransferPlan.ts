"use client";

import { useCallback, useState } from "react";
import { getTrajectory } from "@/shared/api/squad";
import { planEntryKey, type PlanEntry } from "../lib/transferPlan";
import type { PoolPlayer } from "@/shared/types/api";

/**
 * The multi-gameweek transfer plan: an ordered log of "in this gameweek, swap
 * this slot for that player" entries, each independent of the others. Nothing
 * here reaches the FPL API - it's a sandbox for trying out a run of transfers
 * before making any of them for real, same spirit as the pitch's swap preview
 * but timestamped to a specific future gameweek instead of applying from now
 * onward.
 */
export function useTransferPlan(windowEndEvent: number | null) {
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addEntry = useCallback(
    async (outLiveId: number, gwEvent: number, candidate: PoolPlayer) => {
      if (windowEndEvent == null) return;
      const key = planEntryKey(outLiveId, gwEvent);
      setAddingKey(key);
      setError(null);
      try {
        const trajectory = await getTrajectory(candidate.id, {
          next_event: gwEvent,
          gw_count: Math.max(1, windowEndEvent - gwEvent + 1),
        });
        const inPlayer = {
          id: candidate.id,
          web_name: candidate.web_name,
          cost: candidate.cost,
          position: candidate.position,
          player_photo: candidate.player_photo,
          team_short: candidate.team_short,
          team_badge: candidate.team_badge,
        };
        setEntries((prev) => [
          ...prev.filter((e) => e.key !== key),
          { key, gwEvent, outLiveId, inPlayer, inTrajectory: trajectory.trajectory },
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that transfer");
      } finally {
        setAddingKey(null);
      }
    },
    [windowEndEvent],
  );

  const removeEntry = useCallback((outLiveId: number, gwEvent: number) => {
    const key = planEntryKey(outLiveId, gwEvent);
    setEntries((prev) => prev.filter((e) => e.key !== key));
  }, []);

  const clearAll = useCallback(() => setEntries([]), []);

  return { entries, addingKey, error, addEntry, removeEntry, clearAll };
}
