// Client-side "connected team" helpers: parse a team id from either a raw
// number or a pasted FPL URL, and persist it on the device (localStorage).
// No login/credentials - just the public team id, like every reputable FPL
// tool. See the /api/entry/{id} backend endpoint.

export type { TeamEntry } from "@/shared/types/api";

const STORAGE_KEY = "fpl.teamId";

export function parseTeamId(input: string): number | null {
  const s = (input || "").trim();
  // Accept a full FPL URL (.../entry/1234567/...) or a bare numeric id.
  const urlMatch = s.match(/entry\/(\d+)/i);
  const raw = urlMatch ? urlMatch[1] : s;
  if (!/^\d+$/.test(raw)) return null;
  const id = parseInt(raw, 10);
  return id > 0 ? id : null;
}

export function loadStoredTeamId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v ? parseTeamId(v) : null;
  } catch {
    return null;
  }
}

export function storeTeamId(id: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // Ignore (private mode / storage disabled) - the app still works per-session.
  }
}

export function clearStoredTeamId(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

// Other teams the user is tracking in the My Squad workspace (their rivals,
// friends, etc.) - distinct from their own connected team. Stored as a list
// of public team IDs on this device.
const TRACKED_TEAMS_KEY = "fpl.trackedTeamIds";

export function loadTrackedTeamIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const v = window.localStorage.getItem(TRACKED_TEAMS_KEY);
    if (!v) return [];
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export function storeTrackedTeamIds(ids: number[]): void {
  try {
    window.localStorage.setItem(TRACKED_TEAMS_KEY, JSON.stringify(ids));
  } catch {
    // Ignore.
  }
}

// Tracked public leagues (Leagues page's "compare against any public
// league" feature - see backend's /api/leagues/{id}/standings, which
// works for any public classic league id, not just ones you've joined).
const LEAGUES_STORAGE_KEY = "fpl.trackedLeagueIds";

export function parseLeagueId(input: string): number | null {
  const s = (input || "").trim();
  // Accept a full FPL league URL (.../leagues/314/standings/c) or a bare numeric id.
  const urlMatch = s.match(/leagues\/(\d+)/i);
  const raw = urlMatch ? urlMatch[1] : s;
  if (!/^\d+$/.test(raw)) return null;
  const id = parseInt(raw, 10);
  return id > 0 ? id : null;
}

export function loadTrackedLeagueIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const v = window.localStorage.getItem(LEAGUES_STORAGE_KEY);
    if (!v) return [];
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export function storeTrackedLeagueIds(ids: number[]): void {
  try {
    window.localStorage.setItem(LEAGUES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Ignore (private mode / storage disabled) - the app still works per-session.
  }
}

// Label cache for tracked leagues, learned when a league's standings load.
// The id list above stays the source of truth - this only supplies a nicer
// name than "League 314" once we've seen one, so an uncached id still renders.
const LEAGUE_NAMES_KEY = "fpl.trackedLeagueNames";

export function loadTrackedLeagueNames(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const v = window.localStorage.getItem(LEAGUE_NAMES_KEY);
    if (!v) return {};
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function storeTrackedLeagueName(id: number, name: string): void {
  try {
    const next = { ...loadTrackedLeagueNames(), [String(id)]: name };
    window.localStorage.setItem(LEAGUE_NAMES_KEY, JSON.stringify(next));
  } catch {
    // Ignore.
  }
}

// The last league whose standings you actually opened, so a return visit can
// reopen it instead of showing a picker.
//
// Kept separate from the tracked-id list because it answers a different
// question: tracked means "keep this league in my list", last-viewed means "this
// is the one I'm following right now", and a league can be either without being
// the other - your own mini-league is in the list without being tracked, and a
// country league you tracked once isn't necessarily the one you care about
// today. Deliberately a single id rather than a history: this only exists to
// pick a landing view, and anything more would need a UI to manage it.
const LAST_LEAGUE_KEY = "fpl.lastViewedLeagueId";

export function loadLastViewedLeagueId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(LAST_LEAGUE_KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function storeLastViewedLeagueId(id: number): void {
  try {
    window.localStorage.setItem(LAST_LEAGUE_KEY, String(id));
  } catch {
    // Ignore (private mode / storage disabled) - the app still works per-session.
  }
}

// Label cache for tracked teams, learned when an entry loads. Same shape and
// same reasoning as the league cache above: the id list stays the source of
// truth, this only means a chip can say "Bruno's XI" instead of "Team 1178869"
// once we've seen the name. An uncached id still renders, just less usefully.
const TEAM_NAMES_KEY = "fpl.trackedTeamNames";

export function loadTrackedTeamNames(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const v = window.localStorage.getItem(TEAM_NAMES_KEY);
    if (!v) return {};
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function storeTrackedTeamName(id: number, name: string): void {
  try {
    const next = { ...loadTrackedTeamNames(), [String(id)]: name };
    window.localStorage.setItem(TEAM_NAMES_KEY, JSON.stringify(next));
  } catch {
    // Ignore.
  }
}

/**
 * Where a squad in the workspace came from, which decides what you can do to it.
 *
 * - `"fpl"` - a real entry pulled from the official game by public id. Its picks
 *   are whatever FPL says they are, so it can be reloaded but not edited.
 * - `"local"` - a squad built here and saved. Nothing upstream owns it, so it
 *   can be edited and renamed but there's nothing to reload from.
 *
 * The distinction is worth carrying in the model rather than inferring it,
 * because it's the thing that decides which controls a team gets.
 */
export type TeamSource = "fpl" | "local";

export function formatRank(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("en-GB");
}

export function initials(name: string | null): string {
  if (!name) return "FA";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "FA";
}
