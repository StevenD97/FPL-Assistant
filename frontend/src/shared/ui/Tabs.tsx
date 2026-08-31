"use client";

import { useRef, type ReactNode } from "react";

/**
 * Shared tab bar. Promoted from the hand-rolled Pill switcher in MatchesTabs,
 * which several screens had each reinvented (matches, squad build mode, the
 * players "lens" control, the optimizer's underline bar).
 *
 * Styled like `Pill` but with its own markup on purpose: Pill hard-codes
 * `aria-pressed`, and a tab needs `aria-selected` instead - a button carrying
 * both is invalid. Roving tabindex + arrow keys follow the ARIA tabs pattern.
 */
export type TabItem<T extends string> = {
  id: T;
  label: string;
  /** Optional trailing count/marker, e.g. a number of rows behind the tab. */
  badge?: ReactNode;
};

export function tabPanelId(id: string): string {
  return `tabpanel-${id}`;
}

function tabId(id: string): string {
  return `tab-${id}`;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className = "",
}: {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Accessible name for the tablist, e.g. "Squad views". */
  label: string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Left/Right (and Home/End) move between tabs and activate as they go, which
  // is the expected behaviour for tab bars whose panels are already rendered.
  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    let next = index;
    if (delta !== 0) next = (index + delta + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;

    event.preventDefault();
    onChange(tabs[next].id);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={`flex flex-wrap gap-1.5 ${className}`}
    >
      {tabs.map((tab, i) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            aria-selected={active}
            aria-controls={tabPanelId(tab.id)}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "border-pl-purple bg-pl-purple text-white"
                : "border-border-strong bg-white text-text-secondary hover:border-pl-purple/40"
            }`}
          >
            {tab.label}
            {tab.badge != null && (
              <span className={`ml-1.5 font-mono ${active ? "text-white/70" : "text-text-muted"}`}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The panel half of the pair - wires up the ids/role that `Tabs` points at. */
export function TabPanel({
  id,
  active,
  children,
  className = "",
}: {
  id: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={tabPanelId(id)}
      aria-labelledby={`tab-${id}`}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}
