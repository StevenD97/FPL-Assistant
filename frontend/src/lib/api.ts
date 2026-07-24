// Backend error responses (FastAPI's HTTPException) carry a helpful
// {"detail": "..."} body - e.g. explaining that FPL purges manager pick
// history at each season boundary, not just a bare status code. Falls
// back to the status code if the body isn't JSON or has no detail field.
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
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
