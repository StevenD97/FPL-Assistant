"use client";

import { useSyncExternalStore } from "react";

// A personal, device-local watchlist of player ids that any component can read
// and toggle - starred on the Players list / detail, surfaced back in the
// squad builder. Backed by a tiny external store so every star icon stays in
// sync without threading a provider through the tree.
const KEY = "xfpl:shortlist";
const EMPTY: number[] = [];

let ids: number[] = readStorage();
const listeners = new Set<() => void>();

function readStorage(): number[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const v = window.localStorage.getItem(KEY);
    const parsed = v ? JSON.parse(v) : [];
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // Ignore (private mode / storage disabled) - still works for the session.
  }
}

export function toggleShortlist(id: number) {
  ids = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  persist();
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Full list (reactive). getServerSnapshot returns a stable empty array so SSR
// and the first client paint agree; useSyncExternalStore re-syncs after hydrate.
export function useShortlist(): number[] {
  return useSyncExternalStore(
    subscribe,
    () => ids,
    () => EMPTY,
  );
}
