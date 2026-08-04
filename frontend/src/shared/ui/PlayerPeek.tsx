"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PlayerCard, type CardStat } from "@/shared/ui/PlayerCard";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { Button } from "@/shared/ui/Button";
import { FdrChip } from "@/shared/ui/FdrChip";
import type { PlayerAlternative } from "@/shared/types/api";

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
  /**
   * Next fixtures with their difficulty, so the FDR tooltip's "1 = easiest,
   * 5 = hardest" describes something actually on screen. The ticker string
   * ("ARS(H)") names the opponent but says nothing about difficulty, which made
   * the tooltip a promise the section didn't keep. Falls back to the ticker when
   * a caller has no structured fixtures.
   */
  fixtures?: { opponent: string; isHome: boolean; difficulty: number; badgeUrl?: string }[];
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
  replace,
}: {
  player: PeekPlayer;
  onClose: () => void;
  /** Context-specific controls (remove, substitute…). */
  actions?: ReactNode;
  /**
   * Swapping this player out, as a second *view of this panel* rather than a
   * second panel.
   *
   * It used to be its own modal opened from a button in here, which stacked a
   * dialog on a dialog: two backdrops, two Escape handlers racing, and the player
   * you were replacing hidden behind the thing replacing him. Now the panel
   * switches to the candidates and back, so there's one dialog throughout and the
   * comparison happens where the subject was.
   */
  replace?: {
    /** Fetched lazily on first open - candidates aren't needed until asked for. */
    load: () => Promise<PlayerAlternative[]>;
    onSelect: (candidateId: number) => void;
  };
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"player" | "replace">("player");
  const [candidates, setCandidates] = useState<PlayerAlternative[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidatesError, setCandidatesError] = useState(false);

  async function openReplace() {
    setView("replace");
    if (candidates != null || loadingCandidates) return;
    setLoadingCandidates(true);
    setCandidatesError(false);
    try {
      setCandidates(await replace!.load());
    } catch {
      setCandidatesError(true);
    } finally {
      setLoadingCandidates(false);
    }
  }

  // Escape closes, and focus moves onto the panel so a keyboard reader lands on
  // what they just opened. Same contract as Inspector.
  //
  // From the replace view Escape steps back to the player rather than closing
  // outright - it's one dialog with two views, so the key should undo the last
  // move. This is exactly what the nested modal got wrong: two handlers bound at
  // once, and whichever won decided how far back you went.
  useEffect(() => {
    panelRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (view === "replace") setView("player");
      else onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, view]);

  const duties: { label: string; order?: number }[] = [
    { label: "Pens", order: player.penaltiesOrder },
    { label: "Free kicks", order: player.freekicksOrder },
    { label: "Corners", order: player.cornersOrder },
  ];
  const shownDuties = duties.filter((d) => dutyLabel(d.order));
  // Whether there's a second column at all. It drives the panel width too: a
  // 512px panel around a 300px card left 200px of nothing beside it, which is the
  // same imbalance the old side column caused, just quieter.
  const hasAside = shownDuties.length > 0 || !!player.news;

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
        className={`relative z-[1] max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-lg outline-none sm:rounded-2xl sm:p-5 ${
          // The replace view needs room for three cards abreast; the player view
          // sizes to its own content (see hasAside).
          //
          // Not transitioned. `transition-[max-width]` looked like a free bit of
          // polish and instead pinned the panel: the browser wouldn't interpolate
          // from a literal 22rem to `var(--container-xl)`, so it kept the old
          // value and the replace view stayed 352px wide with the cards stacked
          // in a column.
          view === "replace" ? "max-w-xl" : hasAside ? "max-w-lg" : "max-w-[22rem]"
        }`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {view === "replace" ? (
              <>
                <button
                  type="button"
                  onClick={() => setView("player")}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-pl-purple hover:underline"
                >
                  ← {player.name}
                </button>
                <span className="text-md font-bold text-text-primary">Replace</span>
              </>
            ) : (
              <>
                <h3 className="text-md font-bold text-pl-purple">{player.name}</h3>
                {player.status && <StatusBadge status={player.status} news={player.news ?? ""} />}
              </>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg text-text-muted hover:bg-surface-sunken hover:text-text-primary"
          >
            ×
          </button>
        </div>

        {view === "player" && (
        <>
        {/* The card is the panel, with its context stacked under it. It used to sit
            beside a right-hand column, which only held enough to justify itself on
            the builder's peek - on a loaded squad that column was one fixture line
            and a paragraph, so the card was squeezed narrow next to mostly empty
            space. Anything that still has a right column gets one; otherwise the
            card takes the width. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="mx-auto flex w-full max-w-[300px] shrink-0 flex-col gap-3 sm:mx-0">
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

            {/* Directly under the card, where it reads as this player's next
                fixture rather than a separate panel of its own. */}
            {(player.fixtures?.length || player.fixtureTicker) && (
              <div className="rounded-lg border border-border bg-surface-sunken px-3 py-2">
                <p className="mb-1 flex items-center gap-1 text-3xs font-bold uppercase tracking-[0.1em] text-text-muted">
                  Next {player.fixtures?.length ?? player.fixtureCount ?? ""}{" "}
                  <InfoTooltip term="fdr" />
                </p>
                {player.fixtures?.length ? (
                  // Difficulty is the colour, which is what the tooltip explains.
                  <div className="flex flex-wrap gap-1">
                    {player.fixtures.map((f, i) => (
                      <FdrChip
                        key={`${f.opponent}-${i}`}
                        opponent={f.opponent}
                        isHome={f.isHome}
                        difficulty={f.difficulty}
                        badgeUrl={f.badgeUrl}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="font-mono text-sm text-text-secondary">{player.fixtureTicker}</p>
                )}
              </div>
            )}
          </div>

          {hasAside && (
            <div className="min-w-0 flex-1 space-y-3">
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

              {player.news && (
                <p className="rounded-lg border border-warning/30 bg-warning-bg px-2.5 py-2 text-xs text-text-secondary">
                  {player.news}
                </p>
              )}
            </div>
          )}
        </div>

        </>
        )}

        {view === "replace" && replace && (
          <div>
            {loadingCandidates && <p className="text-sm text-text-muted">Finding replacements…</p>}
            {!loadingCandidates && candidatesError && (
              <p className="text-sm text-danger">Couldn&apos;t load suggestions.</p>
            )}
            {!loadingCandidates && !candidatesError && candidates?.length === 0 && (
              <p className="text-sm text-text-muted">No affordable replacements found.</p>
            )}
            {!loadingCandidates && !candidatesError && !!candidates?.length && (
              <>
                {/* The same card the rest of the app uses, so a comparison is
                    read the same way as a player - three side by side, each the
                    whole button. */}
                <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                  {candidates.map((c) => (
                    <PlayerCard
                      key={c.id}
                      size="compact"
                      onClick={() => {
                        replace.onSelect(c.id);
                        onClose();
                      }}
                      name={c.web_name}
                      position={c.position}
                      teamShort={c.team_short}
                      teamBadge={c.team_badge}
                      photo={c.player_photo}
                      rating={c.predicted_points.toFixed(1)}
                      stats={[
                        { k: "COST", v: `£${c.cost.toFixed(1)}m` },
                        { k: "VALUE", v: c.value.toFixed(2), tooltip: "value" },
                      ]}
                    />
                  ))}
                </div>
                <p className="mt-3 text-xs text-text-muted">
                  Picking one previews the swap in your Transfer planner below.
                </p>
              </>
            )}
          </div>
        )}

        {/* One row, one height. It was a PlayerLink styled as a button beside real
            Buttons of a different size, so the baseline stepped mid-row; every
            control here is now the same height and the destructive one is pushed
            to the end rather than sitting next in line after "find". */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <PlayerLink
            id={player.id}
            className="inline-flex h-8 items-center rounded-md border border-border-strong px-3 text-sm font-medium text-text-primary hover:bg-slate-50"
          >
            Full profile →
          </PlayerLink>
          {replace && (
            <Button size="sm" variant="secondary" onClick={openReplace}>
              Find replacements
            </Button>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
}
