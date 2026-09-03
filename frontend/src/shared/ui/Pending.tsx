"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A wait the reader can tell apart from a hang.
 *
 * These calls are not fast. The transfer optimiser solves an integer program;
 * the chip scan projects every player across a fifteen-gameweek window. Warm,
 * they are quick, but a cold container pays seconds and the reader has no way
 * to tell "working" from "broken" - the page said "Solving..." in muted grey
 * and then said it for another eight seconds.
 *
 * So: a moving indicator, so it reads as activity rather than a label; a
 * live-region announcement, so it isn't only visible to people who can see it;
 * and after {slowAfterMs} a second line that admits it is taking a while.
 * Nothing here fakes a progress bar - we don't know how far along it is, and a
 * bar that lies is worse than no bar.
 */
export function Pending({
  label,
  slowLabel = "Still working - this one takes a few seconds the first time.",
  slowAfterMs = 3000,
  className = "",
}: {
  label: string;
  slowLabel?: string;
  slowAfterMs?: number;
  className?: string;
}) {
  const slow = useElapsed(slowAfterMs);

  return (
    <div className={`flex items-start gap-2.5 ${className}`} role="status" aria-live="polite">
      <Spinner />
      <div className="min-w-0">
        <p className="text-sm text-text-secondary">{label}</p>
        {slow && <p className="mt-0.5 text-xs text-text-muted">{slowLabel}</p>}
      </div>
    </div>
  );
}

/** The same wait, inline in a row of text. */
export function PendingInline({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary" role="status" aria-live="polite">
      <Spinner />
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-border-strong border-t-brand motion-reduce:animate-none"
    />
  );
}

/** True once `ms` has passed since mount. */
function useElapsed(ms: number): boolean {
  const [passed, setPassed] = useState(false);
  const msRef = useRef(ms);
  useEffect(() => {
    const timer = setTimeout(() => setPassed(true), msRef.current);
    return () => clearTimeout(timer);
  }, []);
  return passed;
}
