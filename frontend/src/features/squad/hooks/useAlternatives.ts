"use client";

import { useCallback, useState } from "react";
import type { PlayerAlternative } from "@/shared/types/api";
import { getAlternatives } from "../api";
import { useAsyncResource } from "./useAsyncResource";

/**
 * Replacement suggestions for one squad player, opened from that player's row.
 * Acts as a disclosure: asking for the player already showing closes it again.
 */
export function useAlternatives() {
  const [suggestFor, setSuggestFor] = useState<{
    liveId: number;
    name: string;
  } | null>(null);
  const resource = useAsyncResource<PlayerAlternative[]>();
  const { run, reset, set } = resource;

  const toggle = useCallback(
    async (liveId: number, name: string) => {
      if (suggestFor?.liveId === liveId) {
        setSuggestFor(null);
        reset();
        return;
      }
      setSuggestFor({ liveId, name });
      const rows = await run(() => getAlternatives(liveId));
      // Nothing actionable to tell the user if this fails - the row just
      // reports no suggestions rather than an error, as it did before.
      if (!rows) set([]);
    },
    [suggestFor, run, reset, set],
  );

  return {
    suggestFor,
    alternatives: resource.data,
    loading: resource.loading,
    toggle,
  };
}
