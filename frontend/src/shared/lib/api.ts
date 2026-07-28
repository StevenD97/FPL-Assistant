export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Backend error responses (FastAPI's HTTPException) carry a helpful
// {"detail": "..."} body - e.g. explaining that FPL purges manager pick
// history at each season boundary, not just a bare status code. Falls
// back to the status code if the body isn't JSON or has no detail field.
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = await res.json();
      detail = typeof body?.detail === "string" ? body.detail : undefined;
    } catch {
      // Response wasn't JSON - fall through to the generic message.
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json();
}

/**
 * The way to reach the backend: takes a path, not a URL, so no caller has to
 * know or re-derive the base. `T` should come from "@/shared/types/api", which
 * is generated from the pinned response snapshots - see
 * scripts/gen-api-types.mjs.
 *
 *   const players = await apiGet<PlayerListItem[]>("/api/players");
 */
export function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  return fetchJson<T>(`${API_URL}${path}`, init);
}
