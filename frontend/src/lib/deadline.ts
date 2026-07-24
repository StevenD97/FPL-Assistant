// Shared deadline constants + formatter. Kept in a plain (non-"use client")
// module so Server Components can import the string values directly - a
// value imported from a "use client" module becomes a client reference,
// not the actual value.

// The next real FPL deadline. 2026/27 GW1 is 2026-08-21 (see README);
// FPL deadlines are ~90 min before the first kickoff, ~11:30 BST.
// TODO: wire to the backend's bootstrap `events[].deadline_time` so this
// advances automatically each gameweek instead of being pinned to GW1.
export const NEXT_DEADLINE_ISO = "2026-08-21T10:30:00Z";
export const NEXT_DEADLINE_LABEL = "GW1 · Fri 21 Aug, 11:30";

export function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return "0d 00h 00m";
  const totalMinutes = Math.floor(msLeft / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
}
