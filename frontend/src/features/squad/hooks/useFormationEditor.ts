"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFlash } from "@/shared/lib/useFlash";
import type { Position, SquadPlayer } from "@/shared/types/api";

type Role = "Starting XI" | "Bench";

const DEF_RANGE = [3, 5] as const;
const MID_RANGE = [2, 5] as const;
const FWD_RANGE = [1, 3] as const;

function countByPosition(players: { pos: Position }[]): Record<Position, number> {
  const counts: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) counts[p.pos]++;
  return counts;
}

/**
 * A local, unsaved "what if" formation editor for the pitch view: tap a
 * starting XI player then a bench player (or the reverse) to sub them,
 * mimicking the official app's pick-team screen. This never reaches the FPL
 * API - the app only ever reads public data - so a real substitution still
 * has to be made on the official site before the deadline; this is a preview.
 */
export function useFormationEditor(squad: SquadPlayer[] | undefined) {
  const [roleOverrides, setRoleOverrides] = useState<Record<number, Role>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signatureRef = useRef<string>("");

  /**
   * A substitution moves two players between the pitch and the bench, and until
   * now it did so silently - the only feedback was the layout changing, which is
   * easy to miss on a phone where one of the two ends up off-screen. Flagging
   * both ends lets the pitch and bench ring them so the swap acknowledges itself.
   */
  const { flash: flashSwap, clear: clearSwapFlash, ids: justSwappedIds } = useFlash();

  const signature = useMemo(
    () =>
      (squad ?? [])
        .map((p) => `${p.id}:${p.role}`)
        .sort()
        .join(","),
    [squad],
  );

  useEffect(() => {
    if (signature !== signatureRef.current) {
      signatureRef.current = signature;
      setRoleOverrides({});
      setSelectedId(null);
      setError(null);
      clearSwapFlash();
    }
  }, [signature, clearSwapFlash]);

  const effectiveSquad = useMemo(
    () => (squad ?? []).map((p) => ({ ...p, role: roleOverrides[p.id] ?? p.role })),
    [squad, roleOverrides],
  );

  const startingXi = effectiveSquad.filter((p) => p.role === "Starting XI");
  const counts = countByPosition(startingXi);
  const formation = `${counts.DEF}-${counts.MID}-${counts.FWD}`;
  const isDirty = Object.keys(roleOverrides).length > 0;

  function reset() {
    setRoleOverrides({});
    setSelectedId(null);
    setError(null);
    clearSwapFlash();
  }

  function trySwap(aId: number, bId: number) {
    const a = effectiveSquad.find((p) => p.id === aId);
    const b = effectiveSquad.find((p) => p.id === bId);
    if (!a || !b || a.role === b.role) return;

    if ((a.pos === "GKP") !== (b.pos === "GKP")) {
      setError("Goalkeepers can only be swapped with your bench goalkeeper.");
      return;
    }

    const nextXiIds = new Set(startingXi.map((p) => p.id));
    if (a.role === "Starting XI") {
      nextXiIds.delete(aId);
      nextXiIds.add(bId);
    } else {
      nextXiIds.delete(bId);
      nextXiIds.add(aId);
    }
    const nextCounts = countByPosition(effectiveSquad.filter((p) => nextXiIds.has(p.id)));

    if (nextCounts.DEF < DEF_RANGE[0] || nextCounts.DEF > DEF_RANGE[1]) {
      setError(
        `A legal formation needs ${DEF_RANGE[0]}-${DEF_RANGE[1]} defenders - this swap would leave ${nextCounts.DEF}.`,
      );
      return;
    }
    if (nextCounts.MID < MID_RANGE[0] || nextCounts.MID > MID_RANGE[1]) {
      setError(
        `A legal formation needs ${MID_RANGE[0]}-${MID_RANGE[1]} midfielders - this swap would leave ${nextCounts.MID}.`,
      );
      return;
    }
    if (nextCounts.FWD < FWD_RANGE[0] || nextCounts.FWD > FWD_RANGE[1]) {
      setError(
        `A legal formation needs ${FWD_RANGE[0]}-${FWD_RANGE[1]} forwards - this swap would leave ${nextCounts.FWD}.`,
      );
      return;
    }

    setRoleOverrides((prev) => {
      const next: Record<number, Role> = { ...prev, [aId]: b.role, [bId]: a.role };
      const originalRoleById = new Map((squad ?? []).map((p) => [p.id, p.role]));
      for (const key of Object.keys(next)) {
        const id = Number(key);
        if (originalRoleById.get(id) === next[id]) delete next[id];
      }
      return next;
    });
    setError(null);
    flashSwap(aId, bId);
  }

  function select(id: number) {
    if (selectedId === null) {
      setSelectedId(id);
      setError(null);
      return;
    }
    if (selectedId === id) {
      setSelectedId(null);
      setError(null);
      return;
    }
    const a = effectiveSquad.find((p) => p.id === selectedId);
    const b = effectiveSquad.find((p) => p.id === id);
    if (a && b && a.role === b.role) {
      // Same side - move the selection rather than attempting a no-op sub.
      setSelectedId(id);
      setError(null);
      return;
    }
    trySwap(selectedId, id);
    setSelectedId(null);
  }

  return { effectiveSquad, formation, isDirty, selectedId, select, reset, error, justSwappedIds };
}
