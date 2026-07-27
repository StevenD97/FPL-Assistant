"use client";

import { useEffect, useState } from "react";
import { NEXT_DEADLINE_ISO, formatCountdown } from "@/shared/lib/deadline";

export function Countdown({ target = NEXT_DEADLINE_ISO, className = "" }: { target?: string; className?: string }) {
  // Render a stable placeholder on the server; fill in the live value after
  // mount to avoid a hydration mismatch on the ticking clock.
  const [text, setText] = useState("—");

  useEffect(() => {
    const deadline = new Date(target).getTime();
    const tick = () => setText(formatCountdown(deadline - Date.now()));
    tick();
    const id = setInterval(tick, 1000 * 30);
    return () => clearInterval(id);
  }, [target]);

  return (
    <span className={`font-mono tabular-nums ${className}`} suppressHydrationWarning>
      {text}
    </span>
  );
}
