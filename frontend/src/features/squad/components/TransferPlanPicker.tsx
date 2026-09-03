"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { Pending } from "@/shared/ui/Pending";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import type { PoolPlayer } from "@/shared/types/api";
import type { PlanCandidate } from "../lib/transferPlan";

const MAX_RESULTS = 40;

/**
 * The plan's candidate search: unlike the quick pitch/table swap (capped at
 * the top 3 suggestions, for a fast now-preview), this is meant to be
 * browsed - full-squad's worth of same-position players, searchable by name
 * or team, so a plan several gameweeks out can be built from a real
 * shortlist rather than whichever 3 the model liked best today.
 *
 * Draws from the same player pool the squad builder already loads whole
 * (getPlayerPool), fetched once by the caller and passed in - filtering
 * client-side keeps every keystroke instant with no extra requests.
 */
export function TransferPlanPicker({
  pool,
  poolLoading,
  outgoing,
  gwEvent,
  maxCost,
  excludeIds,
  replacingPlanned,
  onSelect,
  onClose,
}: {
  pool: PoolPlayer[] | null;
  poolLoading: boolean;
  outgoing: PlanCandidate;
  gwEvent: number;
  maxCost: number;
  excludeIds: number[];
  /**
   * Name of the player already planned into this slot for this gameweek, if
   * any. The outgoing player is still whoever leaves the squad, so without
   * this the header would name someone the pitch isn't currently showing.
   */
  replacingPlanned?: string;
  onSelect: (candidate: PoolPlayer) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const titleId = useId();

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const results = useMemo(() => {
    if (!pool) return [];
    const excluded = new Set(excludeIds);
    let rows = pool.filter(
      (p) => p.position === outgoing.position && !excluded.has(p.id) && p.cost <= maxCost + 0.05,
    );
    const q = search.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/);
      rows = rows.filter((p) =>
        tokens.every((tok) => p.web_name.toLowerCase().includes(tok) || p.team_short.toLowerCase().includes(tok)),
      );
    }
    return [...rows].sort((a, b) => b.predicted_points - a.predicted_points).slice(0, MAX_RESULTS);
  }, [pool, outgoing.position, excludeIds, maxCost, search]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="animate-fpl-fade absolute inset-0 bg-ink-900/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-fpl-fade relative flex max-h-[80vh] w-full max-w-md flex-col rounded-lg border border-border bg-surface shadow-lg"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <div className="min-w-0">
            <p id={titleId} className="truncate text-sm font-semibold text-text-primary">
              Replace {outgoing.web_name} · GW{gwEvent}
            </p>
            <p className="text-xs text-text-muted">
              <span className="font-mono font-medium text-text-secondary">£{maxCost.toFixed(1)}m</span> available ·{" "}
              {outgoing.position} only
            </p>
            {replacingPlanned && (
              <p className="text-xs text-text-primary">
                Changes your planned {replacingPlanned} for this week
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-lg leading-none text-text-muted hover:text-text-primary"
          >
            ×
          </button>
        </div>
        <div className="border-b border-border p-2">
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or team…"
            className="w-full rounded-md border border-border px-2.5 py-1.5 text-sm text-text-primary"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {poolLoading && <Pending className="p-2" label="Loading players…" />}
          {!poolLoading && results.length === 0 && (
            <p className="p-2 text-sm text-text-muted">
              No affordable {outgoing.position}{search ? " matches that search" : " found"}.
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className="flex w-full items-center gap-2 rounded-md border border-border bg-surface-sunken/60 px-2 py-1.5 text-sm hover:border-brand/40 hover:bg-ink-900/5"
                >
                  <PlayerPhoto
                    src={c.player_photo}
                    name={c.web_name}
                    className="h-8 w-8 shrink-0 rounded-full border border-border-strong bg-surface object-cover object-top text-xs"
                  />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-1">
                      <span className="truncate font-medium text-text-primary">{c.web_name}</span>
                      <StatusBadge status={c.status} news={c.news} />
                    </span>
                    <TeamBadge teamShort={c.team_short} name={c.team_short} badgeUrl={c.team_badge} />
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-text-secondary">£{c.cost.toFixed(1)}m</span>
                    <span className="block font-mono font-semibold text-text-primary">
                      {c.predicted_points.toFixed(1)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <p className="border-t border-border p-2 text-center text-xs text-text-muted">
          Predicted points here are this player&apos;s general outlook <InfoTooltip term="xPts" /> - picking one
          fetches their gameweek-by-gameweek trajectory for the plan.
        </p>
      </div>
    </div>,
    document.body,
  );
}
