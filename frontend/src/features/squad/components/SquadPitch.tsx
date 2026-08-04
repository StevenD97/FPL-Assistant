"use client";

import { useState } from "react";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { PitchFormation, type PitchPlayer } from "@/shared/pitch/PitchFormation";
import { PlayerPeek } from "@/shared/ui/PlayerPeek";
import type { CardStat } from "@/shared/ui/PlayerCard";
import { domainRating, hasSignal, makeScale, percentileRating } from "@/shared/lib/rating";
import { TransferSuggestions } from "./TransferSuggestions";
import { getAlternatives } from "@/shared/api/squad";
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
    selected,
    burst: justSwapped ? "ring" : undefined,
  };
}

/**
 * Dials for a loaded squad.
 *
 * No player pool here, so a percentile isn't available - these rate against the
 * squad itself for the open-ended stats, and against a real ceiling where one
 * exists (minutes can only reach 90, the duty score only 1). Rating within the
 * squad is a narrower claim than the builder's percentile, which is why the label
 * says "in squad".
 *
 * Every stat is gated on `hasSignal`. The demo squad has no form and no
 * rotation-risk values at all - zero for all fifteen - and three flat dials out of
 * six would read as "this player has none of it" rather than "we don't hold this".
 * A suppressed stat loses the reader nothing that was there.
 */
function peekStats(p: SquadPlayer, squad: SquadPlayer[]): CardStat[] {
  const col = (get: (x: SquadPlayer) => number) => squad.map(get);
  const withinSquad = (get: (x: SquadPlayer) => number) =>
    hasSignal(col(get)) ? percentileRating(get(p), makeScale(col(get))) ?? undefined : undefined;

  const candidates: (CardStat | null)[] = [
    {
      k: "EP next",
      v: p.ep_next.toFixed(1),
      tooltip: "epNext",
      rating: withinSquad((x) => x.ep_next),
    },
    { k: "xGI", v: p.expected_goal_involvements.toFixed(2), rating: withinSquad((x) => x.expected_goal_involvements) },
    { k: "ICT", v: p.ict_index.toFixed(0), rating: withinSquad((x) => x.ict_index) },
    // Minutes and duty have real ceilings, so a proportion beats a rank.
    hasSignal(col((x) => x.expected_minutes))
      ? {
          k: "Minutes",
          v: Math.round(p.expected_minutes).toString(),
          rating: domainRating(p.expected_minutes, { max: 90 }) ?? undefined,
        }
      : null,
    hasSignal(col((x) => x.set_piece_duty_score))
      ? {
          k: "Set pieces",
          v: p.set_piece_duty_score.toFixed(2),
          rating: domainRating(p.set_piece_duty_score, { max: 1 }) ?? undefined,
        }
      : null,
    // Inverted: low rotation risk is the good end, so a raw dial would award 99
    // to the player most likely to be benched.
    hasSignal(col((x) => x.rotation_risk))
      ? {
          k: "Nailed",
          v: p.rotation_risk.toFixed(2),
          rating: domainRating(p.rotation_risk, { max: 1, invert: true }) ?? undefined,
        }
      : null,
  ];

  return candidates.filter((s): s is CardStat => s != null && s.rating != null);
}

/** The starting XI laid out on the pitch, with the four-man bench beneath it. */
export function SquadPitch({
  squad,
  bank,
  onReplace,
  nextFixtures,
}: {
  squad: SquadPlayer[];
  bank: number;
  /** Previews swapping `candidateId` into `originalPlayerId`'s slot (see useSwapPreview). */
  onReplace: (originalPlayerId: number, candidateId: number) => void;
  /**
   * Upcoming fixtures with difficulty, keyed by **live** player id.
   * `next_opponent` on a SquadPlayer is only a string, so difficulty comes from
   * the planner, which the page already has (see PlannerOpponent).
   *
   * Live id, not `SquadPlayer.id`: the planner works in the live 2026/27
   * id-space while a squad row's own `id` is the archived one. Keying this the
   * obvious way matched nothing at all - 0 of 15 - and fell back to the ticker
   * silently, which is exactly the id-space mix-up `live_id` exists to prevent.
   */
  nextFixtures?: Map<number, { opponent: string; isHome: boolean; difficulty: number }[]>;
}) {
  const [editingFormation, setEditingFormation] = useState(false);
  // Tapping a player used to follow a link to /players/[id], which abandoned the
  // workspace one click from the panel built to keep you in it. It peeks instead,
  // and the full profile is a deliberate step out from there.
  const [peekId, setPeekId] = useState<number | null>(null);
  const { effectiveSquad, formation, isDirty, selectedId, select, reset, error, justSwappedIds } =
    useFormationEditor(squad);

  const squadById = new Map(squad.map((p) => [p.id, p]));
  const peekPlayer = peekId != null ? squadById.get(peekId) ?? null : null;
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
        onPlayerClick={editingFormation ? select : (id) => setPeekId(id)}
        playerClickLabel={
          editingFormation
            ? (name) => `Select ${name} to substitute`
            : (name) => `View ${name}'s stats`
        }
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
                // Bench players peek too - the same tap doing two different
                // things depending on where the player is sitting would be the
                // odd choice.
                <button
                  type="button"
                  onClick={() => setPeekId(p.id)}
                  aria-label={`View ${p.web_name}'s stats`}
                  className="flex flex-col items-center gap-1 text-center"
                >
                  <PlayerPhoto
                    src={p.player_photo}
                    name={p.web_name}
                    className="size-10 rounded-full border-2 border-border-strong bg-white object-cover object-top text-3xs"
                  />
                  <span className="whitespace-nowrap text-2xs font-medium text-text-primary">{p.web_name}</span>
                </button>
              )}
            </div>
          ))}
      </div>

      {peekPlayer && (
        <PlayerPeek
          player={{
            id: peekPlayer.live_id ?? peekPlayer.id,
            name: peekPlayer.web_name,
            position: peekPlayer.pos,
            teamShort: peekPlayer.team_short,
            teamBadge: peekPlayer.team_badge,
            photo: peekPlayer.player_photo,
            cost: peekPlayer.cost,
            predictedPoints: peekPlayer.ep_next,
            fixtureTicker: peekPlayer.next_opponent,
            fixtures:
              peekPlayer.live_id != null ? nextFixtures?.get(peekPlayer.live_id) : undefined,
            status: peekPlayer.status,
            news: peekPlayer.news,
            ratedStats: peekStats(peekPlayer, squad),
          }}
          onClose={() => setPeekId(null)}
          replace={
            peekPlayer.live_id != null
              ? {
                  load: () =>
                    getAlternatives(peekPlayer.live_id!, {
                      limit: 3,
                      exclude: excludeIds,
                      maxCost: bank + peekPlayer.cost,
                    }),
                  onSelect: (candidateId) => onReplace(peekPlayer.live_id!, candidateId),
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
