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
