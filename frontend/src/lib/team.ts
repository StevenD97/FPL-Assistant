// Client-side "connected team" helpers: parse a team id from either a raw
// number or a pasted FPL URL, and persist it on the device (localStorage).
// No login/credentials - just the public team id, like every reputable FPL
// tool. See the /api/entry/{id} backend endpoint.

export type TeamEntry = {
  id: number;
  player_name: string | null;
  team_name: string | null;
  overall_rank: number | null;
  overall_points: number | null;
  team_value: number | null;
  bank: number | null;
  gameweek: number | null;
};

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
