"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { Logo } from "@/components/brand/Logo";
import { NavIcon, type IconName } from "./icons";
import { PageTransition } from "./PageTransition";
import { CommandPalette, OPEN_PALETTE_EVENT } from "./CommandPalette";
import { Footer } from "./Footer";
import { Countdown, DeadlineLabel } from "@/shared/ui/Countdown";
import { DiscordCTA } from "@/shared/ui/DiscordCTA";
import { useTeam } from "@/shared/team/TeamProvider";
import { formatRank, initials } from "@/shared/lib/team";

type NavItem = { href: string; label: string; icon: IconName; short?: string };
type NavSection = { label?: string; items: NavItem[] };

/**
 * Four destinations, then everything else behind one disclosure.
 *
 * Eight top-level links across four labelled groups is not a hierarchy, it is
 * a list with headings: every destination looked equally important, so none of
 * them did. These four are what a manager opens week to week - their
 * dashboard, their squad, the player list, their leagues - and they are the
 * same four the mobile tab bar already promoted, so the two navigations now
 * agree instead of implying different priorities on different screens.
 *
 * The rest are real pages people do go to, just not every week; they are one
 * tap away under "More" rather than competing for attention with the four.
 * Fixtures + Schedule are merged into one Matches page.
 */
const PRIMARY_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/squad", label: "My Squad", icon: "squad", short: "Squad" },
  { href: "/players", label: "Players", icon: "players" },
  { href: "/leagues", label: "Leagues", icon: "leagues" },
];

const SECONDARY_ITEMS: NavItem[] = [
  { href: "/matches", label: "Matches", icon: "fixtures" },
  { href: "/teams", label: "Teams", icon: "teams" },
  { href: "/price-watch", label: "Price Watch", icon: "price-watch" },
  { href: "/accuracy", label: "Accuracy", icon: "accuracy" },
  { href: "/blog", label: "Blog", icon: "blog" },
];

const NAV_SECTIONS: NavSection[] = [
  { items: PRIMARY_ITEMS },
  { label: "More", items: SECONDARY_ITEMS },
];

const NAV: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

// Destinations with their own mobile bottom-tab; the rest live behind the
// "More" tab, which opens a bottom sheet. The tab bar is the single mobile nav
// mechanism - no separate hamburger/drawer (that was redundant with "More").
const PRIMARY = new Set(PRIMARY_ITEMS.map((i) => i.href));

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarTeam() {
  const { entry, promptConnect, disconnect } = useTeam();
  if (entry) {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-surface/5 p-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger text-[11px] font-bold text-white">
            {initials(entry.player_name)}
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-xs font-semibold text-white">
              {entry.player_name ?? entry.team_name ?? `Team ${entry.id}`}
            </span>
            <span className="font-mono text-[10px] text-ink-300">
              {entry.overall_rank != null ? `OR ${formatRank(entry.overall_rank)}` : `ID ${entry.id}`}
            </span>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={promptConnect}
            className="flex-1 rounded-md bg-surface/10 px-2 py-1 text-[11px] font-semibold text-white hover:bg-surface/15"
          >
            Switch
          </button>
          <button
            type="button"
            onClick={disconnect}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-ink-300 hover:text-white"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={promptConnect}
      className="flex items-center gap-2 rounded-xl bg-surface/5 p-2.5 text-sm text-ink-200 transition-colors hover:bg-surface/10 hover:text-white"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-danger text-[11px] font-bold text-white">
        +
      </span>
      Connect your team
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const current = NAV.find((n) => isActive(pathname, n.href));

  // Close the "More" sheet whenever the route changes. Adjusted during render
  // against the previous pathname rather than in an effect: an effect would
  // paint the new route once with the sheet still open, and React's own
  // guidance is to reset derived state this way. Setting state during render
  // of the same component is the supported form - React re-runs this render
  // immediately without committing the first pass.
  const [sheetRoute, setSheetRoute] = useState(pathname);
  if (sheetRoute !== pathname) {
    setSheetRoute(pathname);
    setMoreOpen(false);
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="bg-fpl-sidebar sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col gap-6 border-r border-white/10 px-3.5 py-5 lg:flex">
        <Link href="/" className="flex items-center px-2">
          <Logo size={37} tone="dark" />
        </Link>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
          className="flex items-center gap-2 rounded-[9px] border border-white/10 bg-surface/5 px-2.5 py-2 text-sm text-ink-400 transition-colors hover:bg-surface/10 hover:text-white"
        >
          <span aria-hidden="true">⌕</span>
          <span>Search</span>
          <kbd className="ml-auto rounded bg-surface/10 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>

        <LayoutGroup id="desktop-nav">
          <nav className="flex flex-1 flex-col gap-3 overflow-y-auto">
            {NAV_SECTIONS.map((section, si) => (
              <div key={si} className="flex flex-col gap-0.5">
                {section.label && (
                  <span className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-400">
                    {section.label}
                  </span>
                )}
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex items-center gap-2.5 rounded-[9px] px-2.5 py-2.5 text-sm transition-colors ${
                        active
                          ? "font-semibold text-ink-900"
                          : "font-medium text-ink-200 hover:bg-surface/5 hover:text-white"
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="desktop-nav-active"
                          className="absolute inset-0 rounded-[9px] bg-brand"
                          transition={{ type: "spring", stiffness: 400, damping: 34 }}
                        />
                      )}
                      <NavIcon name={item.icon} className="relative z-[1] h-[18px] w-[18px]" />
                      <span className="relative z-[1]">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </LayoutGroup>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 rounded-xl border border-brand/35 bg-brand/10 p-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-text-primary">Deadline</span>
            <Countdown className="text-lg font-bold text-white" />
            <span className="text-[11px] text-ink-300"><DeadlineLabel /></span>
          </div>
          <SidebarTeam />
          <DiscordCTA
            variant="inline"
            className="justify-center rounded-xl border border-white/10 bg-surface/5 py-2.5 text-sm font-medium text-ink-200 hover:bg-surface/10 hover:text-white"
          />
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="bg-fpl-hero sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
          <Link href="/" className="tap-target flex items-center gap-2.5">
            <Logo variant="mark" size={30} tone="dark" />
            <span className="flex flex-col leading-tight">
              <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-text-primary">
                {current?.label ?? "xFPL"}
              </span>
              <span className="text-sm font-semibold text-white">xFPL</span>
            </span>
          </Link>
          <span className="flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/15 px-2.5 py-1.5">
            <span className="animate-fpl-pulse h-1.5 w-1.5 rounded-full bg-brand" />
            <Countdown className="text-xs font-semibold text-white" />
          </span>
        </header>

        <main className="flex-1 bg-surface-sunken">
          <PageTransition>{children}</PageTransition>
        </main>
        <Footer />

        {/* Mobile bottom tab bar - the single mobile nav */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch border-t border-border bg-surface px-1 py-1 lg:hidden"
          style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom))" }}
        >
          {NAV.filter((n) => PRIMARY.has(n.href)).map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-1 rounded-[10px] px-1 py-1.5 text-[10px] font-semibold transition-colors ${
                  active ? "bg-brand/15 text-brand" : "text-ink-400"
                }`}
              >
                <NavIcon name={item.icon} className="h-5 w-5" />
                {item.short ?? item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            aria-label="More"
            className={`flex flex-1 flex-col items-center gap-1 rounded-[10px] px-1 py-1.5 text-[10px] font-semibold transition-colors ${
              moreOpen ? "bg-brand/15 text-text-primary" : "text-ink-400"
            }`}
          >
            <NavIcon name="menu" className="h-5 w-5" />
            More
          </button>
        </nav>
      </div>

      {/* Mobile "More" bottom sheet (app-style, slides up) */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            className="fixed inset-0 z-40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-ink-900/50" onClick={() => setMoreOpen(false)} aria-hidden="true" />
            {/* Draggable on the y-axis so it dismisses with a downward swipe,
                the way a native sheet does. Constraints pin it at rest and
                elasticity is bottom-only, so it rubber-bands down but never
                lifts above its resting position; a short drag springs back. */}
            <motion.div
              className="bg-fpl-sidebar absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-white/10 p-4 shadow-lg"
              style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 38 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.55 }}
              dragMomentum={false}
              onDragEnd={(_, info) => {
                // Either a decisive distance or a quick flick closes it.
                if (info.offset.y > 90 || info.velocity.y > 500) setMoreOpen(false);
              }}
              role="dialog"
              aria-label="More menu"
            >
              {/* Grab handle - also a tap target, so the sheet is dismissable
                  without a swipe (and for pointer users who won't try one). */}
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="mx-auto mb-4 block cursor-grab touch-none rounded-full px-6 py-1.5 active:cursor-grabbing"
              >
                <span className="block h-1.5 w-10 rounded-full bg-surface/20" />
              </button>
              <div className="grid grid-cols-3 gap-2">
                {NAV.filter((n) => !PRIMARY.has(n.href)).map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-[11px] font-semibold transition-colors ${
                        active
                          ? "border-brand bg-brand/15 text-white"
                          : "border-white/10 bg-surface/5 text-ink-200 hover:bg-surface/10 hover:text-white"
                      }`}
                    >
                      <NavIcon name={item.icon} className="h-5 w-5" />
                      <span className="text-center leading-tight">{item.label}</span>
                    </Link>
                  );
                })}
                <DiscordCTA variant="tile" />
              </div>
              <div className="mt-4">
                <SidebarTeam />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CommandPalette />
    </div>
  );
}
