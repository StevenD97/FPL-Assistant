"use client";

import { useSyncExternalStore } from "react";

// Auto-saved squad draft (the "Build a draft" scratchpad). Persisted to this
// device so a half-built squad survives a reload or navigating away - same
// localStorage approach as tracked teams/leagues (see team.ts). Connected team +
// tracked teams/leagues are already persisted by TeamProvider; this covers the
// one thing a user actively *builds*.
//
// A saved squad is a different idea and lives in localTeams.ts: this stays the
// one scratchpad you're editing, and saving copies it out.
const SQUAD_DRAFT_KEY = "xfpl:squad-draft";

export type SquadDraft = { ids: number[]; budget: number };

const DEFAULT_DRAFT: SquadDraft = { ids: [], budget: 100 };

let cached: SquadDraft | null = null;
const listeners = new Set<() => void>();

export function loadSquadDraft(): SquadDraft {
  if (typeof window === "undefined") return DEFAULT_DRAFT;
  if (cached) return cached;
  try {
    const v = window.localStorage.getItem(SQUAD_DRAFT_KEY);
    if (!v) return (cached = DEFAULT_DRAFT);
    const parsed = JSON.parse(v);
    const ids = Array.isArray(parsed?.ids) ? parsed.ids.filter((n: unknown) => Number.isInteger(n)) : [];
    const budget = typeof parsed?.budget === "number" ? parsed.budget : DEFAULT_DRAFT.budget;
    return (cached = { ids, budget });
  } catch {
    return (cached = DEFAULT_DRAFT);
  }
}

export function storeSquadDraft(draft: SquadDraft): void {
  // Cache the object identity so getSnapshot below is stable between writes -
  // useSyncExternalStore compares by reference and will loop if handed a fresh
  // object every render.
  cached = draft;
  try {
    window.localStorage.setItem(SQUAD_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore (private mode / storage disabled) - the build still works per-session.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * How many players the on-device draft holds, as a reactive value.
 *
 * useSyncExternalStore rather than a mount effect: the server has no
 * localStorage, so getServerSnapshot returns 0 and React re-syncs after
 * hydration. Reading it in an effect instead would mean a setState during mount
 * for something that is really just an external store being read. Same approach
 * as useShortlist.
 *
 * This used to subscribe to nothing, on the grounds that the draft only changed
 * from the builder and the builder was a different page. The switcher now sits
 * above the builder on the same page, so the count has to track edits live -
 * hence the real subscription.
 */
export function useSquadDraftCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => loadSquadDraft().ids.length,
    () => 0,
  );
}
