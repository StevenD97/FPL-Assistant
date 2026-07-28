"use client";

import { useCallback } from "react";
import type {
  ChipResponse,
  PlannerResponse,
  SquadResponse,
  TransferResult,
} from "@/shared/types/api";
import { getChips, getPlanner, getSquad, optimizeTransfers } from "../api";
import { useAsyncResource } from "./useAsyncResource";

/**
 * The four requests behind the loaded-team view. Loading a squad kicks off the
 * other three itself, which is why they live in one hook rather than three the
 * panel would have to sequence by hand.
 *
 * The three follow-ups are bonuses, not blockers: each keeps its own error so a
 * failure renders in its own section while the squad above stays usable. That
 * matters because the optimizer legitimately fails for a team whose pick
 * history FPL has purged at a season boundary.
 */
export function useLoadedSquad() {
  const squad = useAsyncResource<SquadResponse>();
  const optimizer = useAsyncResource<TransferResult>(
    "Couldn't compute suggested transfers",
  );
  const planner = useAsyncResource<PlannerResponse>("Couldn't build the planner");
  const chips = useAsyncResource<ChipResponse>("Couldn't scan chip timing");

  // freeTransfers is passed in rather than captured so the value used is
  // whatever the form held at submit time, matching the previous behaviour:
  // editing the field alone doesn't re-run anything.
  const load = useCallback(
    async (id: string, freeTransfers: number) => {
      if (!id) return;
      const loaded = await squad.run(() => getSquad(id));
      if (!loaded) return;
      optimizer.run(() => optimizeTransfers(id, { free_transfers: freeTransfers }));
      planner.run(() => getPlanner(id));
      chips.run(() => getChips(id));
    },
    [squad.run, optimizer.run, planner.run, chips.run],
  );

  return { squad, optimizer, planner, chips, load };
}
