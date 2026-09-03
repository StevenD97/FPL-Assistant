"use client";

import { useState } from "react";

/**
 * The three questions this page answers, kept apart.
 *
 * They are genuinely different claims and stacking them on one scroll made the
 * page argue with itself: "the ranking beats a naive baseline" is a statistical
 * result, "here is the eleven it would have started" is evidence, and "it would
 * rank 2.5 millionth" is the bottom line. A reader arrives wanting one of the
 * three.
 *
 * Client-side only, and deliberately not routed. The panels are already on the
 * page - the server fetched both records - so switching is instant, and putting
 * a tab in the URL would mean a round trip to show something already in hand.
 * The cost is that a tab cannot be linked to, which nobody has asked for.
 */
export type TabKey = "accuracy" | "team" | "season";

const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: "accuracy", label: "The record", hint: "how well the projections ranked" },
  { key: "team", label: "The team each week", hint: "the eleven it would have started" },
  { key: "season", label: "The season", hint: "what following it would have scored" },
];

export function AccuracyTabs({
  record,
  team,
  season,
}: {
  record: React.ReactNode;
  team: React.ReactNode;
  season: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("accuracy");
  const panels: Record<TabKey, React.ReactNode> = { accuracy: record, team, season };

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Track record views"
        className="scroll-edge -mx-1 flex gap-1 overflow-x-auto border-b border-border px-1"
      >
        {TABS.map((tab) => {
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`accuracy-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`accuracy-panel-${tab.key}`}
              onClick={() => setActive(tab.key)}
              className={`tap-target -mb-px shrink-0 border-b-2 px-3 py-2 text-left transition-colors ${
                selected
                  ? "border-brand text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span className="block text-xs leading-snug text-text-muted">{tab.hint}</span>
            </button>
          );
        })}
      </div>

      {TABS.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`accuracy-panel-${tab.key}`}
          aria-labelledby={`accuracy-tab-${tab.key}`}
          hidden={tab.key !== active}
          className="flex flex-col gap-5"
        >
          {panels[tab.key]}
        </div>
      ))}
    </div>
  );
}
