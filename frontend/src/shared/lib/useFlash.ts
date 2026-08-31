"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Long enough for the confirmation keyframes in globals.css to finish. */
const DEFAULT_MS = 700;

/**
 * Flag some ids as "just changed" for a beat, then clear them.
 *
 * This exists because a CSS animation will not replay while its class stays
 * applied. Driving the class off state that clears itself means React removes
 * and re-adds it, so the same player can be substituted twice in a row and
 * animate both times. Doing it in CSS alone isn't possible; doing it with a
 * `key` bump would remount the card and lose its focus.
 *
 * Callers pass the ids that changed and read `isFlashed` when rendering. The
 * `prefers-reduced-motion` block in globals.css already disables the underlying
 * animations, so there's no motion check to make here - the flag simply has no
 * visible effect for those readers.
 */
export function useFlash(durationMs = DEFAULT_MS) {
  const [ids, setIds] = useState<readonly number[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(
    (...next: number[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setIds(next);
      timerRef.current = setTimeout(() => {
        setIds([]);
        timerRef.current = null;
      }, durationMs);
    },
    [durationMs],
  );

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setIds([]);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const isFlashed = useCallback((id: number) => ids.includes(id), [ids]);

  return { flash, clear, isFlashed, ids };
}
