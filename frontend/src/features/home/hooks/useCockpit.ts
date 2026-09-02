"use client";

import { useCallback, useEffect, useState } from "react";
import { getChips, getSquad, optimizeTransfers } from "@/shared/api/squad";
import { isStatus } from "@/shared/lib/api";
import {
  getFixtureDifficulty,
  getManagerLeagues,
  getOwnedPriceWatch,
  getPlayers,
  getPriceWatch,
} from "@/shared/api/home";
import type {
  ChipResponse,
  FixtureDifficultyRow,
  League,
  PlayerListItem,
  PriceMover,
  SquadResponse,
  TransferResult,
} from "@/shared/types/api";

export type LiveCockpitData = {
  squad: SquadResponse;
  chips: ChipResponse | null;
  transfers: TransferResult | null;
  leagues: League[];
  movers: PriceMover[];
};

export type WaitingCockpitData = {
  topPicks: PlayerListItem[];
  kindestOpeners: FixtureDifficultyRow[];
  movers: PriceMover[];
};

/**
 * Which cockpit the landing page can actually show.
 *
 * "waiting" is the no-picks state: /api/squad/{id} 404s for every manager
 * until their first gameweek locks, because FPL has no pick history before
 * then. That is an answer, not a failure, and it resolves itself at GW1.
 *
 * "error" is everything else - a 502 from the FPL API, a 500 from us, a cold
 * backend that never answered. This used to be folded into the no-picks state,
 * which is why a mid-season manager whose request timed out was told the
 * season hadn't started yet. A request that never landed tells us nothing
 * about the season, so it must never be rendered as a fact about the season.
 */
export type CockpitState =
  | { kind: "loading" }
  | { kind: "live"; data: LiveCockpitData }
  | { kind: "waiting"; data: WaitingCockpitData }
  | { kind: "error"; message: string; retry: () => void };

const MAX_TOP_PICKS = 5;
const MAX_OPENERS = 5;

export function useCockpit(teamId: number | null): CockpitState {
  const [state, setState] = useState<CockpitState>({ kind: "loading" });
  // Bumped by retry() to re-run the effect without changing teamId.
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWaiting(): Promise<WaitingCockpitData> {
      const [players, fixtures, price] = await Promise.all([
        getPlayers().catch(() => [] as PlayerListItem[]),
        getFixtureDifficulty().catch(() => [] as FixtureDifficultyRow[]),
        getPriceWatch().catch(() => null),
      ]);
      return {
        topPicks: [...players]
          .sort((a, b) => b.predicted_points - a.predicted_points)
          .slice(0, MAX_TOP_PICKS),
        // Lowest average difficulty first - the kindest opening run.
        kindestOpeners: [...fixtures]
          .filter((f) => f.avg_difficulty != null)
          .sort((a, b) => (a.avg_difficulty ?? 6) - (b.avg_difficulty ?? 6))
          .slice(0, MAX_OPENERS),
        movers: [...(price?.risers ?? []), ...(price?.fallers ?? [])].slice(0, 4),
      };
    }

    async function load() {
      if (teamId == null) {
        const data = await loadWaiting();
        if (!cancelled) setState({ kind: "waiting", data });
        return;
      }

      let squad: SquadResponse;
      try {
        squad = await getSquad(teamId);
      } catch (err) {
        if (cancelled) return;
        // Only a 404 means FPL genuinely has no picks for this manager yet.
        if (isStatus(err, 404)) {
          const data = await loadWaiting();
          if (!cancelled) setState({ kind: "waiting", data });
          return;
        }
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Something went wrong.",
          retry,
        });
        return;
      }
      if (cancelled) return;

      // Everything below is a bonus on top of the squad: each failure degrades
      // its own panel instead of taking the cockpit down with it.
      const ownedIds = squad.squad
        .map((p) => p.live_id)
        .filter((id): id is number => id != null);

      const [chips, transfers, leagues, price] = await Promise.all([
        getChips(teamId).catch(() => null),
        optimizeTransfers(teamId, { free_transfers: 1 }).catch(() => null),
        getManagerLeagues(teamId).catch(() => [] as League[]),
        ownedIds.length ? getOwnedPriceWatch(ownedIds).catch(() => null) : null,
      ]);
      if (cancelled) return;

      setState({
        kind: "live",
        data: {
          squad,
          chips,
          transfers,
          leagues,
          movers: (price?.owned ?? []).filter((m) => m.direction !== "stable"),
        },
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [teamId, attempt, retry]);

  return state;
}
