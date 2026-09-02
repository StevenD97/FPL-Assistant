export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * A failed backend call, carrying the HTTP status so callers can tell the
 * difference between "the backend answered, and the answer is no" and "the
 * call never landed".
 *
 * That distinction is not cosmetic. /api/squad/{id} 404s for a manager whose
 * first gameweek hasn't locked - a real, expected state with its own screen -
 * while a 500 or a dropped connection means we don't know anything about their
 * squad. Collapsing both into one thrown Error is what let the landing page
 * tell a mid-season manager the season hadn't started yet.
 *
 * `status` is 0 when the request never got a response at all (offline, DNS,
 * CORS, timeout), which is never a legitimate "no".
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  /** True when the backend answered with this exact status. */
  is(status: number): boolean {
    return this.status === status;
  }
}

/** Narrowing helper - `catch` gives you `unknown`, not an ApiError. */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/** True only for a response the backend actually sent with this status. */
export function isStatus(err: unknown, status: number): boolean {
  return isApiError(err) && err.status === status;
}

// Backend error responses (FastAPI's HTTPException) carry a helpful
// {"detail": "..."} body - e.g. explaining that FPL purges manager pick
// history at each season boundary, not just a bare status code. Falls
// back to the status code if the body isn't JSON or has no detail field.
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (cause) {
    // fetch only rejects when the request never completed. Status 0 marks it
    // as "no answer", which callers must not read as a negative answer.
    throw new ApiError(
      cause instanceof Error && cause.message
        ? `Couldn't reach the server (${cause.message})`
        : "Couldn't reach the server",
      0,
    );
  }
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = await res.json();
      detail = typeof body?.detail === "string" ? body.detail : undefined;
    } catch {
      // Response wasn't JSON - fall through to the generic message.
    }
    throw new ApiError(detail || `Request failed (${res.status})`, res.status);
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
 *
 * Rejects with an {@link ApiError}, never a bare Error.
 */
export function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  return fetchJson<T>(`${API_URL}${path}`, init);
}
