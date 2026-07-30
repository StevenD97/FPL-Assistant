"use client";

import { Fragment, useState } from "react";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { TableFrame, Th } from "@/shared/ui/Table";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { TransferSuggestions } from "./TransferSuggestions";
import type { SquadPlayer } from "@/shared/types/api";

/**
 * The squad's per-player numbers, replacing the 12-column table this panel used
 * to render (12 columns x 15 rows = 180 cells, and the third place the same 15
 * players appeared). Four columns are shown; the deeper stats - next opponent,
 * xGI, ICT, Def/90, set-piece duty - move into a per-row expansion, so nothing
 * was dropped, it just isn't all on screen at once.
 *
 * Replacements use the same TransferSuggestions modal as the pitch and bench,
 * so picking one previews it in the planner exactly as it does everywhere else.
 */
export function SquadDetailTable({
  squad,
  bank,
  excludeIds,
  onReplace,
}: {
  squad: SquadPlayer[];
  /** Bank, so a replacement's budget is bank + the sold player's own price. */
  bank: number;
  /** Live ids already owned - they can't also be suggested as replacements. */
  excludeIds: number[];
  onReplace: (originalPlayerId: number, candidateId: number) => void;
}) {
  const [openRow, setOpenRow] = useState<number | null>(null);

  return (
    <div>
      <h3 className="font-semibold text-text-primary">Squad detail</h3>
      <p className="mb-3 mt-0.5 text-xs text-text-muted">
        Expand a player for their underlying stats, or swap them for a suggested replacement - the planner
        above previews the effect.
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
          {squad.map((p) => {
            const expanded = openRow === p.position;
            return (
              <Fragment key={p.position}>
                <tr className="border-t border-border">
                  <td className="cell-primary px-3 py-2.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        <PlayerLink id={p.live_id}>{p.web_name}</PlayerLink> {p.captain_flag}
                      </span>
                      <PositionBadge position={p.pos} />
                      <TeamBadge teamShort={p.team_short} name={p.team_short} badgeUrl={p.team_badge} />
                    </span>
                  </td>
                  <td data-label="Role" className="px-3 py-2.5">
                    {p.role}
                  </td>
                  <td data-label="Score" className="px-3 py-2.5 font-mono font-semibold text-pl-purple">
                    {p.recommendation_score.toFixed(3)}
                  </td>
                  <td data-label="EP next" className="px-3 py-2.5 font-mono">
                    {p.ep_next}
                  </td>
                  <td data-label="Actions" className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setOpenRow(expanded ? null : p.position)}
                        aria-expanded={expanded}
                        className="text-xs font-semibold text-pl-purple hover:underline"
                      >
                        {expanded ? "Hide" : "More"}
                      </button>
                      {p.live_id != null && (
                        <TransferSuggestions
                          playerId={p.live_id}
                          playerName={p.web_name}
                          maxCost={bank + p.cost}
                          excludeIds={excludeIds}
                          onSelect={(candidateId) => onReplace(p.live_id!, candidateId)}
                          trigger="Swap"
                          triggerClassName="text-xs text-pl-purple hover:underline"
                        />
                      )}
                    </span>
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-t border-border bg-surface-sunken/60">
                    <td className="cell-detail px-3 pb-3 pt-1" colSpan={5}>
                      <dl className="flex flex-wrap gap-x-6 gap-y-2">
                        <Stat label="Next opp" value={p.next_opponent} term="nextOpponent" mono={false} />
                        <Stat label="xGI" value={p.expected_goal_involvements} term="xgi" />
                        <Stat label="ICT" value={p.ict_index} term="ictIndex" />
                        <Stat label="Def/90" value={p.defensive_contribution_per_90} term="def90" />
                        <Stat
                          label="Set-piece duty"
                          value={p.set_piece_duty_score.toFixed(2)}
                          term="setPieceDuty"
                        />
                      </dl>
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
