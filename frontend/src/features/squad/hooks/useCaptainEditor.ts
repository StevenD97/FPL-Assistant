"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SquadPlayer } from "@/shared/types/api";

/**
 * A local, unsaved captain/vice-captain reassignment - same preview pattern
 * as useFormationEditor and useSwapPreview (nothing here reaches the FPL
 * API), kept as its own hook because the armband is a different axis from
 * either: it doesn't change who's selected or where they play, just who
 * wears it.
 *
 * Keyed by squad slot id, not live id, so it survives a transfer preview on
 * some *other* slot, and composes with one on this slot too - captaining the
 * player a swap just brought in works the same as captaining a real one.
 */
export function useCaptainEditor(squad: SquadPlayer[] | undefined) {
  const [captainId, setCaptainId] = useState<number | null>(null);
  const [viceId, setViceId] = useState<number | null>(null);
  const signatureRef = useRef<string>("");

  const signature = useMemo(
    () =>
      (squad ?? [])
        .map((p) => p.id)
        .sort((a, b) => a - b)
        .join(","),
    [squad],
  );

  function realCaptain() {
    return (squad ?? []).find((p) => p.captain_flag === "(C)")?.id ?? null;
  }
  function realVice() {
    return (squad ?? []).find((p) => p.captain_flag === "(VC)")?.id ?? null;
  }

  // A genuinely new squad (a different team loaded) resets to its own real
  // armband; the same squad re-rendering with different scores or a swap
  // preview elsewhere must not stomp a reassignment already in progress.
  useEffect(() => {
    if (signature !== signatureRef.current) {
      signatureRef.current = signature;
      setCaptainId(realCaptain());
      setViceId(realVice());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const isDirty = captainId !== realCaptain() || viceId !== realVice();

  function makeCaptain(slotId: number) {
    if (slotId === viceId) setViceId(captainId);
    setCaptainId(slotId);
  }

  function makeVice(slotId: number) {
    if (slotId === captainId) setCaptainId(viceId);
    setViceId(slotId);
  }

  function reset() {
    setCaptainId(realCaptain());
    setViceId(realVice());
  }

  return { captainId, viceId, makeCaptain, makeVice, reset, isDirty };
}
