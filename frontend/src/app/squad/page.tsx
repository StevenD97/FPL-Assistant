"use client";

import { useMemo, useState, type FormEvent } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { useTeam } from "@/shared/team/TeamProvider";
import { LoadTeamPanel } from "@/features/squad/LoadTeamPanel";
import { BuildSquadPanel } from "@/features/squad/BuildSquadPanel";
import { TransferPlanWorkspace } from "@/features/squad/TransferPlanWorkspace";
import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { Button } from "@/shared/ui/Button";
import { TextField } from "@/shared/ui/TextField";
import { parseTeamId, useStoredTeamId } from "@/shared/lib/team";
import { deleteLocalTeam, useLocalTeams } from "@/shared/lib/localTeams";
import { useSquadDraftCount } from "@/shared/lib/draft";

// How many *other* FPL teams a free account can track. Beyond this we show a
// premium seam rather than a hard error - upgrading later just raises the cap.
const FREE_TRACKED_LIMIT = 3;

/**
 * What the workspace is currently showing.
 *
 * `fpl` and `local` are both squads you keep and come back to; the difference is
 * who owns the picks, which is what decides the controls each one gets (see
 * TeamSource in lib/team.ts). `draft` is the single scratchpad - a tool rather
 * than a team, which is why it isn't in the switcher unless it has something in
 * it.
 */
type Selection =
  | { kind: "fpl"; id: number }
  | { kind: "local"; id: string }
  | { kind: "draft" }
  | { kind: "planner" };

function selectionKey(sel: Selection): string {
  if (sel.kind === "draft" || sel.kind === "planner") return sel.kind;
  return `${sel.kind}-${sel.id}`;
}

/**
 * Which workspace to open with, before the reader has chosen one.
 *
 * Your own team wins, then anything saved on this device, and only with
 * nothing at all does the draft open - the page is for the team you already
 * have, not for starting another one.
 *
 * `connectedId` arrives a beat late: TeamProvider restores the id from storage
 * and then fetches the entry. Returning null while a stored id exists but has
 * not resolved is what stops the draft flashing up and being replaced on every
 * visit.
 */
function defaultSelection(
  connectedId: number | null,
  storedTeamId: number | null,
  localTeams: { id: string }[],
): Selection | null {
  if (connectedId != null) return { kind: "fpl", id: connectedId };
  if (storedTeamId != null) return null;
  if (localTeams.length > 0) return { kind: "local", id: localTeams[0].id };
  return { kind: "draft" };
}

export default function SquadPage() {
  const {
    teamId: connectedId,
    entry,
    promptConnect,
    trackedTeamIds,
    trackedTeamNames,
    trackTeam,
    untrackTeam,
  } = useTeam();

  const localTeams = useLocalTeams();
  const draftCount = useSquadDraftCount();

  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  // Default landing view. Your own team wins, then anything you've saved here,
  // and only with nothing at all do we open the draft - the page is for the team
  // you already have, not for starting another one.
  //
  // `connectedId` arrives a beat late (TeamProvider restores it from localStorage
  // and fetches the entry), so defaulting on the first pass opened the *draft* and
  // then swapped to your team once the id landed - a flash of the wrong workspace
  // on every visit. Reading the stored id directly tells us a team is coming, so
  // we can wait for it instead of guessing and correcting.
  // Derived during render rather than written by an effect. Only an explicit
  // pick is state; the default is a function of what is connected and what is
  // saved, and computing it where it is read means the page never paints one
  // workspace and then corrects itself to another.
  const storedTeamId = useStoredTeamId();
  const [picked, setPicked] = useState<Selection | null>(null);
  const selection: Selection | null = picked ?? defaultSelection(connectedId, storedTeamId, localTeams);

  function choose(sel: Selection) {
    setPicked(sel);
  }

  const atTrackLimit = trackedTeamIds.length >= FREE_TRACKED_LIMIT;

  function handleTrack(e: FormEvent) {
    e.preventDefault();
    const id = parseTeamId(addValue);
    if (id == null) {
      setAddError("Enter a numeric team ID or your FPL team URL.");
      return;
    }
    if (id === connectedId) {
      setAddError("That's your connected team - it's already here.");
      return;
    }
    trackTeam(addValue);
    setAddValue("");
    setAddError(null);
    setAdding(false);
    choose({ kind: "fpl", id });
  }

  function handleUntrack(id: number) {
    untrackTeam(id);
    if (selection?.kind === "fpl" && selection.id === id) fallBack();
  }

  function handleDeleteLocal(id: string) {
    deleteLocalTeam(id);
    if (selection?.kind === "local" && selection.id === id) fallBack();
  }

  /** Land somewhere sensible after removing whatever was being shown. */
  function fallBack() {
    if (connectedId != null) choose({ kind: "fpl", id: connectedId });
    else choose({ kind: "draft" });
  }

  const activeFplId = selection?.kind === "fpl" ? selection.id : null;
  const activeLocalId = selection?.kind === "local" ? selection.id : null;
  const isDraft = selection?.kind === "draft";
  const isPlanner = selection?.kind === "planner";

  const yourTeamLabel = useMemo(() => entry?.team_name?.trim() || "Your team", [entry?.team_name]);

  return (
    <PageContainer>
      <PageHeader
        title="My Squad"
        subtitle="Your team, the rivals you're watching, and any squads you've built here."
      />

      {/* Switcher: real squads only. The draft lives behind the + below, because
          it's a tool rather than a team and listing it as a peer implied a parity
          it doesn't have. */}
      <LayoutGroup id="squad-switcher">
        <div className="flex flex-wrap items-center gap-2">
          {connectedId != null ? (
            <TeamChip
              active={activeFplId === connectedId}
              onClick={() => choose({ kind: "fpl", id: connectedId })}
              badge="★"
              label={yourTeamLabel}
              sublabel="Your team"
            />
          ) : (
            <button
              type="button"
              onClick={promptConnect}
              className="shrink-0 rounded-lg border border-dashed border-brand/40 bg-surface px-3.5 py-2 text-left text-sm font-semibold text-brand transition-colors hover:bg-ink-900/5"
            >
              ＋ Connect your team
            </button>
          )}

          {/* Planning ahead only means anything for the team you actually
              manage, so this sits right next to it rather than among the
              squads you're just watching or built - a tool for your team,
              not another team. */}
          {connectedId != null && (
            <TeamChip
              active={isPlanner}
              onClick={() => choose({ kind: "planner" })}
              badge="⇄"
              label="Transfer Plan"
              sublabel="Plan ahead"
            />
          )}

          {/* Rivals pulled from the live game. Named from the cache in
              TeamProvider, falling back to the id when we haven't seen it yet.

              The connected team is filtered out rather than trusted to be absent:
              `handleTrack` refuses to track it, but nothing stops someone
              tracking a team and *then* connecting that same one, which would
              otherwise show the same squad twice under two different labels. */}
          {trackedTeamIds
            .filter((id) => id !== connectedId)
            .map((id) => (
              <TeamChip
                key={id}
                active={activeFplId === id}
                onClick={() => choose({ kind: "fpl", id })}
                badge="◎"
                label={trackedTeamNames[String(id)] || `Team ${id}`}
                sublabel="Tracked"
                onRemove={() => handleUntrack(id)}
                removeLabel="Stop tracking"
              />
            ))}

          {/* Squads built here. Same standing as an FPL team in the switcher -
              the sublabel is what says where the picks came from. */}
          {localTeams.map((t) => (
            <TeamChip
              key={t.id}
              active={activeLocalId === t.id}
              onClick={() => choose({ kind: "local", id: t.id })}
              badge="✎"
              label={t.name}
              sublabel="Built here"
              onRemove={() => handleDeleteLocal(t.id)}
              removeLabel="Delete"
            />
          ))}

          {/* The scratchpad only appears once it holds something, so work in
              progress is never stranded behind a menu. */}
          {draftCount > 0 && (
            <TeamChip
              active={isDraft}
              onClick={() => choose({ kind: "draft" })}
              badge="✎"
              label={`Draft · ${draftCount}/15`}
              sublabel="Unsaved"
            />
          )}

          <button
            type="button"
            onClick={() => {
              setAdding((a) => !a);
              setAddError(null);
            }}
            aria-expanded={adding}
            className="tap-target min-h-[44px] shrink-0 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/40 hover:text-brand"
          >
            ＋ Add
          </button>
        </div>
      </LayoutGroup>

      {/* Both ways of adding a squad, together, so the choice reads as one
          decision: follow someone else's team, or build your own. */}
      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid gap-4 rounded-lg border border-border bg-surface p-3 shadow-sm md:grid-cols-2">
              <form onSubmit={handleTrack}>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-text-muted">
                  Track a team from FPL
                </p>
                {atTrackLimit ? (
                  <p
                    className="rounded-lg border border-border bg-surface-sunken px-3 py-2 text-xs font-semibold text-text-muted"
                    title={`Free accounts track up to ${FREE_TRACKED_LIMIT} other teams. Premium lifts the cap.`}
                  >
                    🔒 You&apos;re tracking {FREE_TRACKED_LIMIT} teams - Premium lifts the cap.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <TextField
                      label="Team ID or FPL URL"
                      value={addValue}
                      onChange={(e) => setAddValue(e.target.value)}
                      placeholder="e.g. 1178869"
                      wrapperClassName="min-w-[180px] flex-1"
                    />
                    <Button type="submit" disabled={!addValue.trim()}>
                      Track
                    </Button>
                  </div>
                )}
                {addError && <p className="mt-2 text-sm font-medium text-danger">{addError}</p>}
              </form>

              <div className="md:border-l md:border-border md:pl-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-text-muted">
                  Build one yourself
                </p>
                <p className="mb-2 text-xs text-text-secondary">
                  Draft a squad from scratch, then save it to keep it alongside your tracked teams.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAdding(false);
                    choose({ kind: "draft" });
                  }}
                >
                  {draftCount > 0 ? `Open draft (${draftCount}/15)` : "Start a draft"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The selected workspace */}
      <AnimatePresence mode="wait">
        {selection && (
          <motion.div
            key={selectionKey(selection)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {selection.kind === "fpl" ? (
              <LoadTeamPanel key={selection.id} initialTeamId={selection.id} embedded />
            ) : selection.kind === "planner" ? (
              connectedId != null && (
                <TransferPlanWorkspace teamId={connectedId} teamName={yourTeamLabel} />
              )
            ) : (
              // A saved squad and the draft are the same workspace; the only
              // difference is where edits are persisted.
              <BuildSquadPanel
                key={selectionKey(selection)}
                localTeamId={selection.kind === "local" ? selection.id : undefined}
                onSaved={(t) => choose({ kind: "local", id: t.id })}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </PageContainer>
  );
}

// A squad in the switcher: badge glyph + name + where it came from, with a
// sliding active highlight (shared layoutId) and an optional remove affordance.
function TeamChip({
  active,
  onClick,
  badge,
  label,
  sublabel,
  onRemove,
  removeLabel = "Remove",
}: {
  active: boolean;
  onClick: () => void;
  badge: string;
  label: string;
  sublabel: string;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className={`relative flex shrink-0 items-center gap-2.5 rounded-lg border px-3.5 py-2 text-left transition-colors ${
          active
            ? "border-brand bg-ink-900 text-white"
            : "border-border bg-surface text-text-primary hover:border-brand/40"
        } ${onRemove ? "pr-8" : ""}`}
      >
        {active && (
          <motion.span
            layoutId="squad-active-chip"
            className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-brand"
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm ${
            active ? "bg-surface/15 text-brand" : "bg-surface-sunken text-brand"
          }`}
          aria-hidden="true"
        >
          {badge}
        </span>
        <span className="flex flex-col leading-tight">
          <span className="max-w-[160px] truncate text-sm font-semibold">{label}</span>
          <span
            className={`text-xs font-bold uppercase tracking-wide ${active ? "text-white/60" : "text-text-muted"}`}
          >
            {sublabel}
          </span>
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${removeLabel} ${label}`}
          className={`absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-xs transition-colors ${
            active
              ? "text-white/70 hover:bg-surface/20 hover:text-white"
              : "text-text-muted hover:bg-surface-sunken hover:text-danger"
          }`}
        >
          ×
        </button>
      )}
    </div>
  );
}
