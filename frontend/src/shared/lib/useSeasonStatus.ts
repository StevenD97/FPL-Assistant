"use client";

import { useEffect, useState } from "react";
import { fetchSeasonStatus, type SeasonStatus } from "./seasonStatus";
import {
  formatDeadlineLabel,
  NEXT_DEADLINE_ISO,
  NEXT_DEADLINE_LABEL,
} from "./deadline";

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

/**
 * The next gameweek deadline, from the backend's bootstrap rather than a
 * hardcoded date - so it's right (FPL's GW1 deadline is 17:30Z, not the 10:30Z
 * the old constant assumed) and advances on its own each gameweek.
 *
 * Falls back to the pinned GW1 values until the fetch lands, which also keeps
 * the server render and the first client render identical.
 */
export function useNextDeadline(): { iso: string; label: string } {
  const status = useSeasonStatus();
  if (!status?.next_deadline) {
    return { iso: NEXT_DEADLINE_ISO, label: NEXT_DEADLINE_LABEL };
  }
  return {
    iso: status.next_deadline,
    label: formatDeadlineLabel(status.next_deadline, status.next_event),
  };
}
