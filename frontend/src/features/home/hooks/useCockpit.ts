"use client";

import { useEffect, useState } from "react";
import { getChips, getSquad, optimizeTransfers } from "@/shared/api/squad";
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

export type PreSeasonCockpitData = {
  topPicks: PlayerListItem[];
  kindestOpeners: FixtureDifficultyRow[];
  movers: PriceMover[];
};

/**
 * Which cockpit the landing page can actually show.
 *
 * "live" needs /api/squad/{id}, which 404s for every manager until their first
 * gameweek locks - FPL has no pick history before then. That isn't an error, it
 * is the pre-season state, so a 404 here falls through to the pre-season
 * cockpit rather than surfacing a failure. It resolves itself at GW1 with no
 * season-boundary logic.
 */
export type CockpitState =
  | { kind: "loading" }
  | { kind: "live"; data: LiveCockpitData }
  | { kind: "preseason"; data: PreSeasonCockpitData };

const MAX_TOP_PICKS = 5;
const MAX_OPENERS = 5;

export function useCockpit(teamId: number | null): CockpitState {
  const [state, setState] = useState<CockpitState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function loadPreSeason(): Promise<PreSeasonCockpitData> {
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
        const data = await loadPreSeason();
        if (!cancelled) setState({ kind: "preseason", data });
        return;
      }

      const squad = await getSquad(teamId).catch(() => null);
      if (cancelled) return;

      if (!squad) {
        // Pre-season, or a manager FPL has no picks for yet.
        const data = await loadPreSeason();
        if (!cancelled) setState({ kind: "preseason", data });
        return;
      }

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
  }, [teamId]);

  return state;
}
