"use client";

import { useSyncExternalStore } from "react";

/**
 * Squads built on this platform and kept, as opposed to real entries pulled from
 * the official game by public id (see TeamSource in team.ts).
 *
 * Deliberately separate from the single working draft in draft.ts: that stays
 * the scratchpad you're actively building in, and saving promotes a *copy* into
 * this list. Keeping the two apart means this needed no migration of anyone's
 * in-progress draft, and it leaves "the thing I'm editing" and "the things I've
 * kept" as different ideas - which is what makes a saved team safe to track
 * alongside an FPL one.
 *
 * Backed by the same tiny external store the shortlist uses, so a chip in the
 * switcher and a Save button in the builder stay in sync without threading a
 * provider through the tree.
 */
export type LocalTeam = {
  id: string;
  name: string;
  playerIds: number[];
  budget: number;
  /** ISO timestamp, so the switcher can order by most recently saved. */
  savedAt: string;
};

const KEY = "xfpl:localTeams";
const EMPTY: LocalTeam[] = [];

let teams: LocalTeam[] = readStorage();
const listeners = new Set<() => void>();

function isLocalTeam(t: unknown): t is LocalTeam {
  if (!t || typeof t !== "object") return false;
  const c = t as Partial<LocalTeam>;
  return (
    typeof c.id === "string" &&
    typeof c.name === "string" &&
    Array.isArray(c.playerIds) &&
    c.playerIds.every((n) => Number.isInteger(n))
  );
}

function readStorage(): LocalTeam[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const v = window.localStorage.getItem(KEY);
    const parsed = v ? JSON.parse(v) : [];
    return Array.isArray(parsed) ? parsed.filter(isLocalTeam) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function commit(next: LocalTeam[]) {
  teams = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(teams));
  } catch {
    // Ignore (private mode / storage disabled) - still works for the session.
  }
  listeners.forEach((l) => l());
}

function newId(): string {
  try {
    return `local:${crypto.randomUUID()}`;
  } catch {
    // randomUUID needs a secure context; a timestamp + random suffix is plenty
    // for ids that never leave this device.
    return `local:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Save a new squad, newest first. Returns it so the caller can select it. */
export function createLocalTeam(name: string, playerIds: number[], budget: number): LocalTeam {
  const team: LocalTeam = {
    id: newId(),
    name: name.trim() || "My team",
    playerIds: [...playerIds],
    budget,
    savedAt: new Date().toISOString(),
  };
  commit([team, ...teams]);
  return team;
}

export function updateLocalTeam(id: string, patch: Partial<Omit<LocalTeam, "id">>): void {
  commit(teams.map((t) => (t.id === id ? { ...t, ...patch, savedAt: new Date().toISOString() } : t)));
}

export function deleteLocalTeam(id: string): void {
  commit(teams.filter((t) => t.id !== id));
}

export function getLocalTeam(id: string): LocalTeam | null {
  return teams.find((t) => t.id === id) ?? null;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * The saved squads (reactive). getServerSnapshot returns a stable empty array so
 * SSR and the first client paint agree; useSyncExternalStore re-syncs after
 * hydration. Same approach as useShortlist.
 */
export function useLocalTeams(): LocalTeam[] {
  return useSyncExternalStore(
    subscribe,
    () => teams,
    () => EMPTY,
  );
}
