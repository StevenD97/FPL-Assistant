// Shared deadline constants + formatter. Kept in a plain (non-"use client")
// module so Server Components can import the string values directly - a
// value imported from a "use client" module becomes a client reference,
// not the actual value.

// Placeholder shown until /api/season-status answers, and if it never does.
// The real value comes from the backend's bootstrap events[].deadline_time via
// useNextDeadline, so it advances by itself each gameweek.
//
// Deliberately not a date. This used to be a pinned GW1 deadline
// ("2026-08-21T17:30:00Z" / "GW1 · Fri 21 Aug, 18:30"), which meant every
// server-rendered page asserted a specific gameweek and a specific time -
// still GW1, twelve days after GW1 had been played, in the HTML a crawler and
// a first paint both see. A hardcoded date is right for exactly one week of
// the season and quietly wrong for the other thirty-seven; an em-dash is
// honest for all thirty-eight.
export const NEXT_DEADLINE_LABEL = "—";

/** "GW3 · Fri 4 Sep, 18:30", in the reader's own timezone. */
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
