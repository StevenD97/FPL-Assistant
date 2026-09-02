"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/shared/lib/deadline";
import { useNextDeadline } from "@/shared/lib/useSeasonStatus";

/**
 * Ticking time-to-deadline. With no `target`, counts down to the next gameweek
 * deadline reported by the backend, so it stays correct without anyone editing
 * a constant each week.
 */
export function Countdown({ target, className = "" }: { target?: string; className?: string }) {
  const { iso } = useNextDeadline();
  const deadline = target ?? iso;

  // Render a stable placeholder on the server; fill in the live value after
  // mount to avoid a hydration mismatch on the ticking clock. It stays a
  // placeholder while `deadline` is null - there is no honest countdown to a
  // deadline we haven't been told yet.
  const [text, setText] = useState("—");

  useEffect(() => {
    if (!deadline) return;
    const at = new Date(deadline).getTime();
    const tick = () => setText(formatCountdown(at - Date.now()));
    tick();
    const id = setInterval(tick, 1000 * 30);
    return () => clearInterval(id);
  }, [deadline]);

  return (
    <span className={`font-mono tabular-nums ${className}`} suppressHydrationWarning>
      {text}
    </span>
  );
}

/** The deadline's own label ("GW1 · Fri 21 Aug, 18:30"), from the same source. */
export function DeadlineLabel({ className = "" }: { className?: string }) {
  const { label } = useNextDeadline();
  return <span className={className}>{label}</span>;
}
