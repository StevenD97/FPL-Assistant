// Shared deadline constants + formatter. Kept in a plain (non-"use client")
// module so Server Components can import the string values directly - a
// value imported from a "use client" module becomes a client reference,
// not the actual value.

// Fallback only, used for the first paint and if /api/season-status can't be
// reached. The real value now comes from the backend's bootstrap
// events[].deadline_time via useNextDeadline, so it advances by itself each
// gameweek.
//
// These constants used to be the only source, and were wrong: they assumed FPL
// sets a deadline ~90 minutes before the first kickoff. 2026/27 GW1 is actually
// 17:30Z, so the countdown ran seven hours fast. Kept in sync with the real
// GW1 value rather than the old guess.
export const NEXT_DEADLINE_ISO = "2026-08-21T17:30:00Z";
export const NEXT_DEADLINE_LABEL = "GW1 · Fri 21 Aug, 18:30";

/** "GW1 · Fri 21 Aug, 18:30", in the reader's own timezone. */
export function formatDeadlineLabel(iso: string, event: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NEXT_DEADLINE_LABEL;
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `GW${event} · ${get("weekday")} ${get("day")} ${get("month")}, ${get("hour")}:${get("minute")}`;
}

export function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return "0d 00h 00m";
  const totalMinutes = Math.floor(msLeft / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
}
