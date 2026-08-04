"use client";

import { useEffect, useState } from "react";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { PitchFormation, type PitchPlayer } from "@/shared/pitch/PitchFormation";
import { PlayerPeek } from "@/shared/ui/PlayerPeek";
import { Button } from "@/shared/ui/Button";
import type { CardStat } from "@/shared/ui/PlayerCard";
import { domainRating, hasSignal, makeScale, percentileRating } from "@/shared/lib/rating";
import { TransferSuggestions } from "./TransferSuggestions";
import { getAlternatives } from "@/shared/api/squad";
import { useFormationEditor } from "../hooks/useFormationEditor";
import { useCaptainEditor } from "../hooks/useCaptainEditor";
import { applySwapPreview } from "../lib/applySwapPreview";
import type { PlayerTrajectory, SquadPlayer } from "@/shared/types/api";

function toPitchPlayer(p: SquadPlayer, selected: boolean, justSwapped: boolean, swapped: boolean): PitchPlayer {
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
    swapped,
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

/**
 * Predicted next-gameweek points for a starting XI - captain's counts twice,
 * same as the real scoring. Used to diff the real lineup against a preview
 * (formation edit, transfer swap, or both) so the effect has a number, not
 * just a changed layout to notice on your own.
 */
function xiPoints(list: SquadPlayer[]): number {
  return list
    .filter((p) => p.role === "Starting XI")
    .reduce((sum, p) => sum + p.ep_next * (p.captain_flag === "(C)" ? 2 : 1), 0);
}

/** The starting XI laid out on the pitch, with the four-man bench beneath it. */
export function SquadPitch({
  squad,
  bank,
  swapPreviews,
  swapCosts,
  swapLoading,
  onReplace,
  onUndoSwap,
  onResetSwaps,
  onPreviewEffect,
  nextFixtures,
}: {
  squad: SquadPlayer[];
  /**
   * Already net of any active swap previews (see LoadTeamPanel) - a second
   * slot's "what can I afford" reflects money a previous swap freed up, not
   * just the real, unpreviewed bank.
   */
  bank: number;
  /** Live-id-keyed replacement previews - shared with the planner table (see useSwapPreview). */
  swapPreviews: Record<number, PlayerTrajectory>;
  /** Live-id-keyed candidate cost - the trajectory endpoint doesn't return a price. */
  swapCosts: Record<number, number>;
  swapLoading: Record<number, boolean>;
  /** Applies swapping `candidateId` (priced at `candidateCost`) into `originalLiveId`'s slot everywhere it's shown. */
  onReplace: (originalLiveId: number, candidateId: number, candidateCost: number) => void;
  onUndoSwap: (originalLiveId: number) => void;
  onResetSwaps: () => void;
  /**
   * Reports the preview's net effect (formation edit, transfer swaps, and/or
   * a captain reassignment, combined) each time it changes, so reads
   * elsewhere on the page - the planner and captaincy summaries - can echo
   * it without recomputing it themselves from state they don't have (all
   * three edits are local to this component).
   */
  onPreviewEffect?: (effect: {
    pointsDelta: number;
    captainAffected: boolean;
    /** Who's captain in the preview right now, if it differs from the real armband. */
    previewCaptainName: string | null;
  }) => void;
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
  const captainEditor = useCaptainEditor(squad);

  // Formation edits (role only) and a swap preview's own details are layered
  // first; the captain/vice reassignment is applied last and always wins,
  // since it's the one axis with no upstream idea of the armband at all (a
  // swap clears it rather than guessing who should inherit it - see
  // applySwapPreview). All three are independent and compose freely.
  const originalById = new Map(squad.map((p) => [p.id, p]));
  const displaySquad = effectiveSquad.map((p) => {
    const preview = p.live_id != null ? swapPreviews[p.live_id] : undefined;
    const withPreview = preview
      ? applySwapPreview(p, preview, p.live_id != null ? swapCosts[p.live_id] : undefined)
      : p;
    const captain_flag =
      p.id === captainEditor.captainId ? "(C)" : p.id === captainEditor.viceId ? "(VC)" : "";
    return captain_flag === withPreview.captain_flag ? withPreview : { ...withPreview, captain_flag };
  });
  const displayById = new Map(displaySquad.map((p) => [p.id, p]));
  const pendingCount = Object.keys(swapPreviews).length;

  function isSwapped(slotId: number): boolean {
    const original = originalById.get(slotId);
    return Boolean(original?.live_id != null && swapPreviews[original.live_id]);
  }

  // What's already owned (including anyone already previewed in) can't also
  // be offered as a replacement - excluded by live id.
  const excludeIds = displaySquad.map((p) => p.live_id).filter((id): id is number => id != null);

  const previewActive = isDirty || pendingCount > 0 || captainEditor.isDirty;
  const pointsDelta = previewActive ? xiPoints(displaySquad) - xiPoints(squad) : 0;
  const previewCaptain = displaySquad.find((p) => p.role === "Starting XI" && p.captain_flag === "(C)");
  // Whoever holds the armband now, not whoever held it originally - a
  // reassignment (or, before one, a captain benched or transferred out) both
  // land here as "nobody with (C) is actually in the previewed XI".
  const captainAffected = previewActive && previewCaptain == null;

  const previewCaptainName = captainEditor.isDirty && previewCaptain ? previewCaptain.web_name : null;

  useEffect(() => {
    onPreviewEffect?.({ pointsDelta, captainAffected, previewCaptainName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsDelta, captainAffected, previewCaptainName]);

  const peekOriginal = peekId != null ? (originalById.get(peekId) ?? null) : null;
  const peekPlayer = peekId != null ? (displayById.get(peekId) ?? null) : null;
  const peekIsSwapped = peekId != null && isSwapped(peekId);

  function cornerControl(displayed: SquadPlayer) {
    const original = originalById.get(displayed.id);
    if (!original || original.live_id == null) return null;
    const originalLiveId = original.live_id;

    if (swapPreviews[originalLiveId]) {
      return (
        <button
          type="button"
          onClick={() => onUndoSwap(originalLiveId)}
          aria-label={`Undo swap - restore ${original.web_name}`}
          title={`Undo - restore ${original.web_name}`}
          className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-pl-purple shadow ring-2 ring-pl-purple transition-transform hover:scale-110"
        >
          <span aria-hidden="true" className="text-xs leading-none">
            ↺
          </span>
        </button>
      );
    }
    if (swapLoading[originalLiveId]) {
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[9px] text-text-muted shadow ring-2 ring-border">
          …
        </span>
      );
    }
    return (
      <TransferSuggestions
        playerId={originalLiveId}
        playerName={original.web_name}
        position={original.pos}
        maxCost={bank + original.cost}
        excludeIds={excludeIds}
        onSelect={(candidateId, candidate) => onReplace(originalLiveId, candidateId, candidate.cost)}
        triggerClassName="h-5 w-5"
      />
    );
  }

  // "Done" closes edit mode without touching the preview - it's not a cancel
  // button. Discarding it is what the separate "Reset formation" link (next
  // to it whenever isDirty) is for.
  function toggleEdit() {
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
              Reset formation
            </button>
          )}
          {captainEditor.isDirty && (
            <button type="button" onClick={captainEditor.reset} className="text-pl-purple underline">
              Reset captain
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
      {previewActive && (
        <div className="mb-2 flex flex-col gap-1 text-xs text-text-muted">
          <p className="flex flex-wrap items-center gap-2">
            {pendingCount > 0 && (
              <span className="rounded-sm bg-pl-purple/10 px-1.5 py-0.5 font-medium text-pl-purple">
                {pendingCount} transfer{pendingCount === 1 ? "" : "s"} previewed
              </span>
            )}
            {/* The number this whole preview is for - a swap or a formation
                change only matters if it moves the predicted score, so that's
                the one figure worth putting in front of the reader rather than
                leaving them to infer it from who moved where. */}
            {pointsDelta !== 0 && (
              <span
                className={`rounded-sm px-1.5 py-0.5 font-mono font-semibold ${
                  pointsDelta > 0 ? "bg-success-bg text-success" : "bg-danger-bg text-danger"
                }`}
              >
                {pointsDelta > 0 ? "+" : ""}
                {pointsDelta.toFixed(1)} pts next GW
              </span>
            )}
            not submitted to FPL - make the real change on the official app before your deadline.
            {pendingCount > 0 && (
              <button type="button" onClick={onResetSwaps} className="text-pl-purple underline">
                Reset all
              </button>
            )}
          </p>
          {captainAffected && (
            <p className="font-medium text-warning">
              Your captain isn&apos;t in this preview&apos;s XI - reassign the armband, or their double points
              aren&apos;t counted above.
            </p>
          )}
        </div>
      )}

      <PitchFormation
        players={displaySquad
          .filter((p) => p.role === "Starting XI")
          .map((p) => toPitchPlayer(p, selectedId === p.id, justSwappedIds.includes(p.id), isSwapped(p.id)))}
        onPlayerClick={editingFormation ? select : (id) => setPeekId(id)}
        playerClickLabel={
          editingFormation ? (name) => `Select ${name} to substitute` : (name) => `View ${name}'s stats`
        }
        renderTransfer={
          editingFormation
            ? undefined
            : (p) => {
                const displayed = displayById.get(p.id);
                return displayed ? cornerControl(displayed) : null;
              }
        }
      />
      <div className="mt-3 flex flex-wrap justify-center gap-4 rounded-lg border border-border bg-surface-sunken px-4 py-3">
        <span className="w-full text-center text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:w-auto sm:text-left">
          Bench
        </span>
        {displaySquad
          .filter((p) => p.role !== "Starting XI")
          .map((p) => {
            const swapped = isSwapped(p.id);
            return (
              // A substitution moves one player each way, so the bench end of the
              // swap gets the same confirmation ring as the pitch end - otherwise
              // only half of what just happened is acknowledged.
              <div
                key={p.id}
                className={`relative flex flex-col items-center gap-1 ${
                  justSwappedIds.includes(p.id) ? "animate-fpl-ring rounded-full" : ""
                }`}
              >
                {!editingFormation && <div className="absolute -right-1 -top-1 z-[2]">{cornerControl(p)}</div>}
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
                      className={`size-10 rounded-full border-2 bg-white object-cover object-top text-3xs ${
                        swapped ? "border-pl-purple ring-4 ring-pl-purple ring-offset-2" : "border-border-strong"
                      }`}
                    />
                    <span className="whitespace-nowrap text-2xs font-medium text-text-primary">{p.web_name}</span>
                  </button>
                )}
              </div>
            );
          })}
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
            fixtures: peekPlayer.live_id != null ? nextFixtures?.get(peekPlayer.live_id) : undefined,
            status: peekPlayer.status,
            news: peekPlayer.news,
            // A swapped-in candidate only carries what TransferSuggestions'
            // picker returned (name, team, cost) - the deeper stats these dials
            // need (xGI, ICT, minutes...) aren't fetched for a preview, so rating
            // them would show the outgoing player's numbers under the wrong name.
            ratedStats: peekIsSwapped ? [] : peekStats(peekPlayer, squad),
          }}
          onClose={() => setPeekId(null)}
          replace={
            // Re-replacing an already-swapped slot isn't offered - same
            // undo-first UX as the corner control above (see cornerControl).
            peekOriginal?.live_id != null && !peekIsSwapped
              ? {
                  load: () =>
                    getAlternatives(peekOriginal.live_id!, {
                      limit: 3,
                      exclude: excludeIds,
                      maxCost: bank + peekOriginal.cost,
                    }),
                  onSelect: (candidateId, candidate) =>
                    onReplace(peekOriginal.live_id!, candidateId, candidate.cost),
                }
              : undefined
          }
          // Captaining only makes sense for someone actually in the previewed
          // XI - the bench doesn't score, so there's nothing to double.
          actions={
            peekId != null && peekPlayer.role === "Starting XI" ? (
              <>
                {peekId !== captainEditor.captainId && (
                  <Button size="sm" variant="secondary" onClick={() => captainEditor.makeCaptain(peekId)}>
                    Make captain
                  </Button>
                )}
                {peekId !== captainEditor.viceId && (
                  <Button size="sm" variant="secondary" onClick={() => captainEditor.makeVice(peekId)}>
                    Make vice-captain
                  </Button>
                )}
              </>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
