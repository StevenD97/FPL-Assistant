"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { useTeam } from "@/shared/team/TeamProvider";
import { LoadTeamPanel } from "@/features/squad/LoadTeamPanel";
import { BuildSquadPanel } from "@/features/squad/BuildSquadPanel";
import { OptimizePanel } from "@/features/squad/OptimizePanel";
import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { Button } from "@/shared/ui/Button";
import { Pill } from "@/shared/ui/Pill";
import { TextField } from "@/shared/ui/TextField";
import { parseTeamId } from "@/shared/lib/team";

// How many *other* teams a free account can track. Beyond this we show a
// premium seam rather than a hard error - upgrading later just raises the cap.
const FREE_TRACKED_LIMIT = 3;

// The workspace shows one thing at a time: a real team (yours or a tracked
// rival), or a from-scratch draft. Optimization isn't a separate destination
// any more - it lives inside whatever you're looking at.
type Selection = { kind: "team"; id: number } | { kind: "build" };

function selectionKey(sel: Selection): string {
  return sel.kind === "team" ? `team-${sel.id}` : "build";
}

export default function SquadPage() {
  const {
    teamId: connectedId,
    entry,
    promptConnect,
    trackedTeamIds,
    trackTeam,
    untrackTeam,
  } = useTeam();

  const [selection, setSelection] = useState<Selection | null>(null);
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [buildMode, setBuildMode] = useState<"manual" | "auto">("manual");

  // Default landing view: your team if one is connected (possibly restored
  // from localStorage after mount), otherwise a fresh draft. Only until the
  // user picks something themselves.
  const [chosen, setChosen] = useState(false);
  useEffect(() => {
    if (chosen) return;
    setSelection(connectedId != null ? { kind: "team", id: connectedId } : { kind: "build" });
  }, [connectedId, chosen]);

  function choose(sel: Selection) {
    setChosen(true);
    setSelection(sel);
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
    choose({ kind: "team", id });
  }

  function handleUntrack(id: number) {
    untrackTeam(id);
    // If we were looking at the team we just removed, fall back gracefully.
    if (selection?.kind === "team" && selection.id === id) {
      choose(connectedId != null ? { kind: "team", id: connectedId } : { kind: "build" });
    }
  }

  const isBuild = selection?.kind === "build";
  const activeTeamId = selection?.kind === "team" ? selection.id : null;

  const yourTeamLabel = useMemo(
    () => entry?.team_name?.trim() || "Your team",
    [entry?.team_name],
  );

  return (
    <PageContainer>
      <PageHeader
        title="My Squad"
        subtitle="One workspace for every team you follow - your side, your rivals, and drafts you're planning. Optimization lives right inside whichever you're looking at."
      />

      {/* Team switcher */}
      <LayoutGroup id="squad-switcher">
        <div className="flex flex-wrap items-center gap-2">
          {/* Your connected team (or a prompt to connect one) */}
          {connectedId != null ? (
            <TeamChip
              active={activeTeamId === connectedId}
              onClick={() => choose({ kind: "team", id: connectedId })}
              badge="★"
              label={yourTeamLabel}
              sublabel="Your team"
            />
          ) : (
            <button
              type="button"
              onClick={promptConnect}
              className="shrink-0 rounded-xl border border-dashed border-pl-purple/40 bg-white px-3.5 py-2 text-left text-sm font-semibold text-pl-purple transition-colors hover:bg-pl-purple/5"
            >
              ＋ Connect your team
            </button>
          )}

          {/* Tracked rivals / friends */}
          {trackedTeamIds.map((id) => (
            <TeamChip
              key={id}
              active={activeTeamId === id}
              onClick={() => choose({ kind: "team", id })}
              badge="◎"
              label={`Team ${id}`}
              sublabel="Tracked"
              onRemove={() => handleUntrack(id)}
            />
          ))}

          {/* From-scratch draft */}
          <TeamChip
            active={isBuild}
            onClick={() => choose({ kind: "build" })}
            badge="✎"
            label="Build a draft"
            sublabel="From scratch"
          />

          {/* Track another team */}
          {atTrackLimit ? (
            <span
              className="shrink-0 rounded-xl border border-border bg-surface-sunken px-3.5 py-2 text-xs font-semibold text-text-muted"
              title={`Free accounts track up to ${FREE_TRACKED_LIMIT} other teams. Premium lifts the cap.`}
            >
              🔒 Track more · Premium
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAdding((a) => !a);
                setAddError(null);
              }}
              className="shrink-0 rounded-xl border border-border bg-white px-3.5 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-pl-purple/40 hover:text-pl-purple"
            >
              ＋ Track a team
            </button>
          )}
        </div>
      </LayoutGroup>

      {/* Inline "track a team" form */}
      <AnimatePresence>
        {adding && (
          <motion.form
            onSubmit={handleTrack}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-3 shadow-sm">
              <TextField
                label="Team ID or FPL URL"
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                placeholder="e.g. 1178869"
                wrapperClassName="min-w-[220px] flex-1"
              />
              <Button type="submit" disabled={!addValue.trim()}>
                Track
              </Button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setAddError(null);
                }}
                className="px-2 py-2 text-sm font-medium text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
            </div>
            {addError && <p className="mt-2 text-sm font-medium text-danger">{addError}</p>}
          </motion.form>
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
            {selection.kind === "team" ? (
              <LoadTeamPanel key={selection.id} initialTeamId={selection.id} embedded />
            ) : (
              <div>
                <div className="mb-5 flex gap-1.5">
                  <Pill active={buildMode === "manual"} onClick={() => setBuildMode("manual")}>
                    Build manually
                  </Pill>
                  <Pill active={buildMode === "auto"} onClick={() => setBuildMode("auto")}>
                    Auto-optimize
                  </Pill>
                </div>
                {buildMode === "manual" ? (
                  <BuildSquadPanel onSwitchToOptimize={() => setBuildMode("auto")} />
                ) : (
                  <OptimizePanel />
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </PageContainer>
  );
}

// A team in the switcher: badge glyph + name + role, with a sliding active
// highlight (shared layoutId) and an optional remove affordance.
function TeamChip({
  active,
  onClick,
  badge,
  label,
  sublabel,
  onRemove,
}: {
  active: boolean;
  onClick: () => void;
  badge: string;
  label: string;
  sublabel: string;
  onRemove?: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className={`relative flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left transition-colors ${
          active
            ? "border-pl-purple bg-pl-purple text-white"
            : "border-border bg-white text-text-primary hover:border-pl-purple/40"
        } ${onRemove ? "pr-8" : ""}`}
      >
        {active && (
          <motion.span
            layoutId="squad-active-chip"
            className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-pl-green"
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm ${
            active ? "bg-white/15 text-pl-green" : "bg-surface-sunken text-pl-purple"
          }`}
          aria-hidden="true"
        >
          {badge}
        </span>
        <span className="flex flex-col leading-tight">
          <span className="max-w-[160px] truncate text-sm font-semibold">{label}</span>
          <span className={`text-[10px] font-bold uppercase tracking-wide ${active ? "text-white/60" : "text-text-muted"}`}>
            {sublabel}
          </span>
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Stop tracking ${label}`}
          className={`absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-xs transition-colors ${
            active ? "text-white/70 hover:bg-white/20 hover:text-white" : "text-text-muted hover:bg-surface-sunken hover:text-danger"
          }`}
        >
          ×
        </button>
      )}
    </div>
  );
}
