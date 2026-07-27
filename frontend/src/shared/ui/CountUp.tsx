"use client";

import { useEffect, useRef, useState } from "react";

// Animated number — the xFPL signature. Counts from its previous value to the
// new one with an ease-out cubic. Respects prefers-reduced-motion.
export function CountUp({
  value,
  decimals = 0,
  duration = 600,
  prefix = "",
  suffix = "",
  className = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || from === to) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(from + (to - from) * eased);
      if (k < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span className={`font-mono tabular-nums ${className}`} suppressHydrationWarning>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
