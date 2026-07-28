import { useSyncExternalStore } from "react";

// Auto-saved squad draft (the manual "Build a draft" workspace). Persisted to
// this device so a half-built squad survives a reload or navigating away -
// same localStorage approach as tracked teams/leagues (see team.ts). Connected
// team + tracked teams/leagues are already persisted by TeamProvider; this
// covers the one thing a user actively *builds*.
const SQUAD_DRAFT_KEY = "xfpl:squad-draft";

export type SquadDraft = { ids: number[]; budget: number };

const DEFAULT_DRAFT: SquadDraft = { ids: [], budget: 100 };

/**
 * How many players the on-device draft holds, as a reactive value.
 *
 * useSyncExternalStore rather than a mount effect: the server has no
 * localStorage, so getServerSnapshot returns 0 and React re-syncs after
 * hydration. Reading it in an effect instead would mean a setState during
 * mount for something that is really just an external store being read.
 * Same approach as useShortlist.
 */
export function useSquadDraftCount(): number {
  return useSyncExternalStore(
    // The draft only changes from the builder, which is a different page, so
    // there is nothing to subscribe to for this read-only count.
    () => () => {},
    () => loadSquadDraft().ids.length,
    () => 0,
  );
}

export function loadSquadDraft(): SquadDraft {
  if (typeof window === "undefined") return DEFAULT_DRAFT;
  try {
    const v = window.localStorage.getItem(SQUAD_DRAFT_KEY);
    if (!v) return DEFAULT_DRAFT;
    const parsed = JSON.parse(v);
    const ids = Array.isArray(parsed?.ids) ? parsed.ids.filter((n: unknown) => Number.isInteger(n)) : [];
    const budget = typeof parsed?.budget === "number" ? parsed.budget : DEFAULT_DRAFT.budget;
    return { ids, budget };
  } catch {
    return DEFAULT_DRAFT;
  }
}

export function storeSquadDraft(draft: SquadDraft): void {
  try {
    window.localStorage.setItem(SQUAD_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore (private mode / storage disabled) - the build still works per-session.
  }
}
