"use client";

import { useState } from "react";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { PitchFormation, type PitchPlayer } from "@/shared/pitch/PitchFormation";
import { TransferSuggestions } from "./TransferSuggestions";
import { useFormationEditor } from "../hooks/useFormationEditor";
import type { SquadPlayer } from "@/shared/types/api";

function toPitchPlayer(p: SquadPlayer, selected: boolean, justSwapped: boolean): PitchPlayer {
  return {
    id: p.id,
    name: p.web_name,
    position: p.pos,
    teamShort: p.team_short,
    photo: p.player_photo,
    teamKit: p.team_kit,
    isCaptain: p.captain_flag === "(C)",
    isViceCaptain: p.captain_flag === "(VC)",
    subtitle: p.next_opponent,
    href: p.live_id != null ? `/players/${p.live_id}` : undefined,
    selected,
    burst: justSwapped ? "ring" : undefined,
  };
}

/** The starting XI laid out on the pitch, with the four-man bench beneath it. */
export function SquadPitch({
  squad,
  bank,
  onReplace,
}: {
  squad: SquadPlayer[];
  bank: number;
  /** Previews swapping `candidateId` into `originalPlayerId`'s slot (see useSwapPreview). */
  onReplace: (originalPlayerId: number, candidateId: number) => void;
}) {
  const [editingFormation, setEditingFormation] = useState(false);
  const { effectiveSquad, formation, isDirty, selectedId, select, reset, error, justSwappedIds } =
    useFormationEditor(squad);

  const squadById = new Map(squad.map((p) => [p.id, p]));
  // What's already owned can't also be a "replacement" - excluded by live id
  // (the id-space player_alternatives itself works in).
  const excludeIds = squad.map((p) => p.live_id).filter((id): id is number => id != null);

  function transferIcon(p: SquadPlayer) {
    if (p.live_id == null) return null;
    const liveId = p.live_id;
    return (
      <TransferSuggestions
        playerId={liveId}
        playerName={p.web_name}
        maxCost={bank + p.cost}
        excludeIds={excludeIds}
        onSelect={(candidateId) => onReplace(liveId, candidateId)}
        triggerClassName="h-5 w-5"
      />
    );
  }

  function toggleEdit() {
    if (editingFormation) reset();
    setEditingFormation((v) => !v);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-secondary">
          Formation <span className="font-mono font-semibold text-text-primary">{formation}</span>
          {editingFormation && (
            <span className="ml-2 text-text-muted">
              {selectedId != null
                ? "Tap a player on the other side to substitute, or tap them again to cancel."
                : "Tap a starting player, then a bench player, to swap them."}
            </span>
          )}
        </p>
        <div className="flex items-center gap-3 text-xs">
          {isDirty && (
            <button type="button" onClick={reset} className="text-pl-purple underline">
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={toggleEdit}
            className={`rounded-md border px-2.5 py-1 font-medium ${
              editingFormation
                ? "border-pl-purple bg-pl-purple text-white"
                : "border-border text-text-secondary hover:border-pl-purple hover:text-pl-purple"
            }`}
          >
            {editingFormation ? "Done" : "Edit formation"}
          </button>
        </div>
      </div>

      {editingFormation && (
        <p className="mb-2 text-xs text-text-muted">
          Preview a substitution or formation change here - it isn&apos;t submitted anywhere. Make the real change
          on the official FPL app before your deadline.
        </p>
      )}
      {error && <p className="mb-2 text-xs font-medium text-danger">{error}</p>}

      <PitchFormation
        players={effectiveSquad
          .filter((p) => p.role === "Starting XI")
          .map((p) => toPitchPlayer(p, selectedId === p.id, justSwappedIds.includes(p.id)))}
        onPlayerClick={editingFormation ? select : undefined}
        playerClickLabel={(name) => `Select ${name} to substitute`}
        renderTransfer={
          editingFormation
            ? undefined
            : (p) => {
                const sp = squadById.get(p.id);
                return sp ? transferIcon(sp) : null;
              }
        }
      />
      <div className="mt-3 flex flex-wrap justify-center gap-4 rounded-lg border border-border bg-surface-sunken px-4 py-3">
        <span className="w-full text-center text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:w-auto sm:text-left">
          Bench
        </span>
        {effectiveSquad
          .filter((p) => p.role !== "Starting XI")
          .map((p) => (
            // A substitution moves one player each way, so the bench end of the
            // swap gets the same confirmation ring as the pitch end - otherwise
            // only half of what just happened is acknowledged.
            <div
              key={p.id}
              className={`relative flex flex-col items-center gap-1 ${
                justSwappedIds.includes(p.id) ? "animate-fpl-ring rounded-full" : ""
              }`}
            >
              {!editingFormation && <div className="absolute -right-1 -top-1 z-[2]">{transferIcon(p)}</div>}
              {editingFormation ? (
                <button
                  type="button"
                  onClick={() => select(p.id)}
                  aria-label={`Select ${p.web_name} to substitute`}
                  className="flex flex-col items-center gap-1 text-center"
                >
                  <PlayerPhoto
                    src={p.player_photo}
                    name={p.web_name}
                    className={`size-10 rounded-full border-2 bg-white object-cover object-top text-3xs ${
                      selectedId === p.id
                        ? "border-pl-green ring-4 ring-pl-green ring-offset-2"
                        : "border-border-strong"
                    }`}
                  />
                  <span className="whitespace-nowrap text-2xs font-medium text-text-primary">{p.web_name}</span>
                </button>
              ) : (
                <PlayerLink id={p.live_id} className="flex flex-col items-center gap-1 text-center">
                  <PlayerPhoto
                    src={p.player_photo}
                    name={p.web_name}
                    className="size-10 rounded-full border-2 border-border-strong bg-white object-cover object-top text-3xs"
                  />
                  <span className="whitespace-nowrap text-2xs font-medium text-text-primary">{p.web_name}</span>
                </PlayerLink>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
