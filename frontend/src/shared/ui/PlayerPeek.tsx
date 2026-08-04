"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { PlayerCard, type CardStat } from "@/shared/ui/PlayerCard";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";

/**
 * Set-piece duty. FPL publishes an order per team per set-piece type, where 1 is
 * first choice; 0 means "not on the list". Being first on penalties is one of the
 * strongest single signals in the game, and it was already in the payload and
 * shown nowhere.
 */
function dutyLabel(order: number | undefined | null): string | null {
  if (!order || order < 1) return null;
  if (order === 1) return "1st";
  if (order === 2) return "2nd";
  if (order === 3) return "3rd";
  return `${order}th`;
}

export type PeekPlayer = {
  id: number;
  name: string;
  position: string;
  teamShort: string;
  teamBadge?: string;
  photo?: string;
  cost: number;
  predictedPoints: number;
  fixtureCount?: number;
  fixtureTicker?: string;
  ownership?: number;
  value?: number;
  status?: string;
  news?: string;
  penaltiesOrder?: number;
  freekicksOrder?: number;
  cornersOrder?: number;
  /**
   * The rated stats for the card's dials, supplied by the caller because only it
   * can derive them honestly: the builder holds the 560-player pool to take a
   * percentile against, a loaded squad holds richer per-player figures but no
   * pool. Rather than pick a lowest common denominator, each passes what it has -
   * and each is responsible for omitting a stat it has no data for, so a dial
   * never sits at zero meaning "unknown". See lib/rating.ts.
   */
  ratedStats?: CardStat[];
};

/**
 * The one place a player is previewed without leaving the squad you're working
 * on.
 *
 * Both pitches used to answer "tell me about him" by leaving: the builder opened
 * a bespoke modal that rebuilt PlayerCard's header by hand, and the loaded-team
 * pitch simply followed a link to /players/[id] and abandoned the workspace. This
 * is the same panel for both, with the full profile as a deliberate exit rather
 * than the default.
 *
 * PlayerCard does the identity half - it already exists, it's the nicer artefact,
 * and it was only used on the player-detail page.
 */
export function PlayerPeek({
  player,
  onClose,
  actions,
}: {
  player: PeekPlayer;
  onClose: () => void;
  /** Context-specific controls (remove, find replacements, substitute…). */
  actions?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, and focus moves onto the panel so a keyboard reader lands on
  // what they just opened. Same contract as Inspector.
  useEffect(() => {
    panelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const duties: { label: string; order?: number }[] = [
    { label: "Pens", order: player.penaltiesOrder },
    { label: "Free kicks", order: player.freekicksOrder },
    { label: "Corners", order: player.cornersOrder },
  ];
  const shownDuties = duties.filter((d) => dutyLabel(d.order));

  // Cost leads and stays a figure, not a dial: a high price isn't a good score,
  // and rating it 0-99 would dress a number the reader must judge in context as
  // praise. The dials after it are the caller's derived ratings.
  const stats: CardStat[] = [
    { k: "COST", v: `£${player.cost.toFixed(1)}m` },
    ...(player.ratedStats ?? []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${player.name} at a glance`}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-[1] max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-lg outline-none sm:rounded-2xl sm:p-5"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-md font-bold text-pl-purple">{player.name}</h3>
            {player.status && <StatusBadge status={player.status} news={player.news ?? ""} />}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg text-text-muted hover:bg-surface-sunken hover:text-text-primary"
          >
            ×
          </button>
        </div>

        {/* Card left, the numbers you'd act on right. Stacks on a phone. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="mx-auto w-full max-w-[248px] shrink-0 sm:mx-0">
            <PlayerCard
              name={player.name}
              position={player.position}
              teamShort={player.teamShort}
              teamBadge={player.teamBadge}
              photo={player.photo}
              rating={player.predictedPoints.toFixed(1)}
              windowLabel={player.fixtureCount != null ? `${player.fixtureCount} GW` : undefined}
              stats={stats}
            />
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            {player.fixtureTicker && (
              <div>
                <p className="mb-1 flex items-center gap-1 text-3xs font-bold uppercase tracking-[0.1em] text-text-muted">
                  Next {player.fixtureCount ?? ""} <InfoTooltip term="fdr" />
                </p>
                <p className="font-mono text-sm text-text-secondary">{player.fixtureTicker}</p>
              </div>
            )}

            {/* Set-piece duties: high signal, previously discarded. Only the
                duties he actually has are listed - a row of "not a taker" is
                noise. */}
            {shownDuties.length > 0 && (
              <div>
                <p className="mb-1 text-3xs font-bold uppercase tracking-[0.1em] text-text-muted">
                  Set pieces
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {shownDuties.map((d) => (
                    <span
                      key={d.label}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold ${
                        d.order === 1
                          ? "border-success/40 bg-success-bg text-success"
                          : "border-border bg-surface-sunken text-text-secondary"
                      }`}
                    >
                      {d.label} · {dutyLabel(d.order)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* What the dials mean, once, rather than a tooltip per ring. Without
                it "72" is a number with no scale attached. */}
            {(player.ratedStats?.length ?? 0) > 0 && (
              <p className="text-xs leading-snug text-text-muted">
                Dials are 0&ndash;99, each stat&apos;s standing against every other
                player &mdash; 50 is mid-table, not a target.
              </p>
            )}

            {player.news && (
              <p className="rounded-lg border border-warning/30 bg-warning-bg px-2.5 py-2 text-xs text-text-secondary">
                {player.news}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <PlayerLink
            id={player.id}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-slate-50"
          >
            Full profile →
          </PlayerLink>
          {actions}
        </div>
      </div>
    </div>
  );
}
