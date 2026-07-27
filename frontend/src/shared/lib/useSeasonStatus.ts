"use client";

import { useEffect, useState } from "react";
import { fetchSeasonStatus, type SeasonStatus } from "./seasonStatus";

// null while loading/on error - callers should have a sensible fallback
// (the pre-season copy) rather than blocking render on this.
export function useSeasonStatus(): SeasonStatus | null {
  const [status, setStatus] = useState<SeasonStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSeasonStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        // Stay null - callers fall back to the pre-season copy, which is
        // correct today and the safer of the two guesses either way.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
