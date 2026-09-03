"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { Pending } from "@/shared/ui/Pending";
import { apiGet } from "@/shared/lib/api";
import type { PlayerComparison } from "@/shared/types/api";

/**
 * "What about him, then?"
 *
 * Every other surface in this app ranks players and shows the top of the list.
 * A manager almost always arrives with a name already in mind, and that name is
 * usually not in the top ten - so the product had an answer for the eleven
 * players it liked and nothing at all to say about the six hundred it didn't.
 *
 * This answers for any of them: how the model rates this player against the
 * best it can find in the same position at or under the same price, and why.
 * Same price, not "best available" - a comparison against someone two million
 * dearer answers a question nobody asked. When nothing at that price projects
 * higher, that is the answer, and it is the more useful one.
 */
export function WhyNot({ playerId }: { playerId: number }) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ready"; data: PlayerComparison } | { kind: "error" }
  >({ kind: "loading" });

  // Reset during render, not in the effect. React's own "adjusting state when
  // a prop changes" pattern: navigating to another player must not show the
  // previous player's verdict for a frame, and doing it in an effect means a
  // committed render with stale content plus a second render to correct it.
  const [renderedFor, setRenderedFor] = useState(playerId);
  if (renderedFor !== playerId) {
    setRenderedFor(playerId);
    setState({ kind: "loading" });
  }

  useEffect(() => {
    let cancelled = false;
    apiGet<PlayerComparison>(`/api/players/${playerId}/comparison`)
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  if (state.kind === "error") return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted">
        The model&apos;s verdict
      </h2>

      {state.kind === "loading" && <Pending className="mt-2" label="Comparing against the field…" />}

      {state.kind === "ready" && (
        <>
          <p
            className={`mt-1.5 text-md font-semibold ${
              state.data.better ? "text-text-primary" : "text-success"
            }`}
          >
            {state.data.better
              ? `${state.data.better.web_name} is the better buy at this price`
              : "Nothing better at this price"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">{state.data.reason}</p>

          {state.data.better && (
            <Link
              href={`/players/${state.data.better.id}`}
              className="tap-target mt-3 flex items-center gap-2.5 rounded-md border border-border p-2 transition-colors hover:border-brand/40 hover:bg-surface-sunken"
            >
              <PlayerPhoto
                src={state.data.better.player_photo}
                name={state.data.better.web_name}
                className="h-9 w-9 shrink-0 rounded-full border border-border bg-surface-sunken object-cover object-top text-[11px]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-text-primary">
                  {state.data.better.web_name}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
                  <span className="font-mono">{state.data.better.team_short}</span>
                  <PositionBadge position={state.data.better.position} />
                  <span className="font-mono">£{state.data.better.cost.toFixed(1)}m</span>
                </span>
              </span>
              <span className="shrink-0 text-right leading-none">
                <span className="block font-mono text-md font-bold text-text-primary">
                  {state.data.better.predicted_points.toFixed(1)}
                </span>
                <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-text-muted">
                  xPts
                </span>
              </span>
            </Link>
          )}
        </>
      )}
    </section>
  );
}
