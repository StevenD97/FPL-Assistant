"use client";

import { Fragment, useState } from "react";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { TableFrame, Th } from "@/shared/ui/Table";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { TransferSuggestions } from "./TransferSuggestions";
import { applySwapPreview } from "../lib/applySwapPreview";
import type { PlayerTrajectory, Position, SquadPlayer } from "@/shared/types/api";

// Same hues as the position badge, as a left-border accent - a column of
// them turns the table into a shape you can scan (four bands of colour) as
// well as a list of rows you read one at a time.
const POSITION_BORDER: Record<Position, string> = {
  GKP: "border-l-pos-gkp",
  DEF: "border-l-pos-def",
  MID: "border-l-pos-mid",
  FWD: "border-l-pos-fwd",
};

/**
 * The squad's per-player numbers, replacing the 12-column table this panel used
 * to render (12 columns x 15 rows = 180 cells, and the third place the same 15
 * players appeared). Four columns are shown; the deeper stats - next opponent,
 * xGI, ICT, Def/90, set-piece duty - move into a per-row expansion, so nothing
 * was dropped, it just isn't all on screen at once.
 *
 * Replacements use the same TransferSuggestions modal as the pitch and bench,
 * and the same shared swapPreviews state (see useSwapPreview) - picking one
 * here shows up on the pitch too, and vice versa.
 */
export function SquadDetailTable({
  squad,
  bank,
  swapPreviews,
  swapCosts,
  swapLoading,
  onReplace,
  onUndoSwap,
}: {
  squad: SquadPlayer[];
  /** Already net of any active swap previews - see SquadPitch's `bank` doc. */
  bank: number;
  swapPreviews: Record<number, PlayerTrajectory>;
  /** Live-id-keyed candidate cost - the trajectory endpoint doesn't return a price. */
  swapCosts: Record<number, number>;
  swapLoading: Record<number, boolean>;
  onReplace: (originalLiveId: number, candidateId: number, candidateCost: number) => void;
  onUndoSwap: (originalLiveId: number) => void;
}) {
  const [openRow, setOpenRow] = useState<number | null>(null);

  // What's already owned (including anyone already previewed in elsewhere)
  // can't also be offered as a replacement - excluded by live id.
  const excludeIds = squad
    .map((p) => (p.live_id != null ? (swapPreviews[p.live_id]?.id ?? p.live_id) : null))
    .filter((id): id is number => id != null);

  return (
    <div>
      <h3 className="font-semibold text-text-primary">Squad detail</h3>
      <p className="mb-3 mt-0.5 text-xs text-text-muted">
        Expand a player for their underlying stats, or swap them for a suggested replacement - it previews
        everywhere this squad is shown, including the pitch.
      </p>
      <TableFrame>
        <thead className="bg-surface-sunken">
          <tr>
            <Th>Player</Th>
            <Th>
              <span className="inline-flex items-center gap-1">
                Role <InfoTooltip term="role" />
              </span>
            </Th>
            <Th>
              <span className="inline-flex items-center gap-1">
                Score <InfoTooltip term="score" />
              </span>
            </Th>
            <Th>
              <span className="inline-flex items-center gap-1">
                EP next <InfoTooltip term="epNext" />
              </span>
            </Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {squad.map((original) => {
            const preview = original.live_id != null ? swapPreviews[original.live_id] : undefined;
            const p = preview
              ? applySwapPreview(original, preview, original.live_id != null ? swapCosts[original.live_id] : undefined)
              : original;
            const expanded = openRow === original.position;
            return (
              <Fragment key={original.position}>
                <tr className={`border-t border-border ${preview ? "bg-ink-900/5" : ""}`}>
                  <td className={`cell-primary border-l-4 px-3 py-2.5 ${POSITION_BORDER[p.pos]}`}>
                    <span className="flex flex-wrap items-center gap-2">
                      <PlayerPhoto
                        src={p.player_photo}
                        name={p.web_name}
                        className="h-8 w-8 shrink-0 rounded-full border border-border-strong bg-surface object-cover object-top text-xs"
                      />
                      <span className="font-medium">
                        <PlayerLink id={p.live_id}>{p.web_name}</PlayerLink> {p.captain_flag}
                      </span>
                      <PositionBadge position={p.pos} />
                      <TeamBadge teamShort={p.team_short} name={p.team_short} badgeUrl={p.team_badge} />
                      {preview && (
                        <span className="rounded-sm bg-ink-900/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-primary">
                          Preview
                        </span>
                      )}
                    </span>
                  </td>
                  <td data-label="Role" className="px-3 py-2.5">
                    {p.role}
                  </td>
                  <td data-label="Score" className="px-3 py-2.5 font-mono font-semibold text-text-primary">
                    {preview ? "—" : p.recommendation_score.toFixed(3)}
                  </td>
                  <td data-label="EP next" className="px-3 py-2.5 font-mono">
                    {p.ep_next}
                  </td>
                  <td data-label="Actions" className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setOpenRow(expanded ? null : original.position)}
                        aria-expanded={expanded}
                        className="tap-target inline-flex items-center text-xs font-semibold text-text-primary hover:underline"
                      >
                        {expanded ? "Hide" : "More"}
                      </button>
                      {preview ? (
                        <button
                          type="button"
                          onClick={() => onUndoSwap(original.live_id!)}
                          className="tap-target inline-flex items-center text-xs font-semibold text-text-primary hover:underline"
                        >
                          Reset
                        </button>
                      ) : swapLoading[original.live_id ?? -1] ? (
                        <span className="text-xs text-text-muted">loading…</span>
                      ) : (
                        original.live_id != null && (
                          <TransferSuggestions
                            playerId={original.live_id}
                            playerName={original.web_name}
                            position={original.pos}
                            maxCost={bank + original.cost}
                            excludeIds={excludeIds}
                            onSelect={(candidateId, candidate) =>
                              onReplace(original.live_id!, candidateId, candidate.cost)
                            }
                            trigger="Swap"
                            triggerClassName="text-xs text-text-primary hover:underline"
                          />
                        )
                      )}
                    </span>
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-t border-border bg-surface-sunken/60">
                    <td className="cell-detail px-3 pb-3 pt-1" colSpan={5}>
                      {preview ? (
                        <p className="text-xs text-text-muted">
                          Deeper stats aren&apos;t shown for a previewed player -{" "}
                          <PlayerLink id={p.live_id} className="text-text-primary hover:underline">
                            see their full profile
                          </PlayerLink>
                          .
                        </p>
                      ) : (
                        <dl className="flex flex-wrap gap-x-6 gap-y-2">
                          <Stat label="Next opp" value={p.next_opponent} term="nextOpponent" mono={false} />
                          <Stat label="Owned" value={`${p.selected_by_percent.toFixed(1)}%`} term="ownership" />
                          <Stat label="xGI" value={p.expected_goal_involvements} term="xgi" />
                          {/* The rates beside the total they're derived from, so the
                              comparison is right there: a high xGI on heavy minutes
                              and a high xG/90 are different claims about a player. */}
                          <Stat label="xG/90" value={p.expected_goals_per_90.toFixed(2)} term="xg90" />
                          <Stat label="xA/90" value={p.expected_assists_per_90.toFixed(2)} term="xa90" />
                          <Stat label="ICT" value={p.ict_index} term="ictIndex" />
                          <Stat label="Def/90" value={p.defensive_contribution_per_90} term="def90" />
                          <Stat
                            label="Set-piece duty"
                            value={p.set_piece_duty_score.toFixed(2)}
                            term="setPieceDuty"
                          />
                        </dl>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </TableFrame>
    </div>
  );
}

function Stat({
  label,
  value,
  term,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  term: Parameters<typeof InfoTooltip>[0]["term"];
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {label} <InfoTooltip term={term} />
      </dt>
      <dd className={`text-sm text-text-primary ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
