"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavIcon, type IconName } from "./icons";
import { Countdown } from "@/components/ui/Countdown";
import { NEXT_DEADLINE_LABEL } from "@/lib/deadline";
import { useTeam } from "@/components/team/TeamProvider";
import { formatRank, initials } from "@/lib/team";

type NavItem = { href: string; label: string; icon: IconName };

const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/squad", label: "My Squad", icon: "squad" },
  { href: "/optimizer", label: "Optimizer", icon: "optimizer" },
  { href: "/squad-builder", label: "Squad Builder", icon: "squad-builder" },
  { href: "/players", label: "Players", icon: "players" },
  { href: "/outlook", label: "Outlook", icon: "outlook" },
  { href: "/differentials", label: "Differentials", icon: "differentials" },
  { href: "/fixtures", label: "Fixtures", icon: "fixtures" },
  { href: "/schedule", label: "Schedule", icon: "schedule" },
  { href: "/chips", label: "Chips", icon: "chips" },
  { href: "/leagues", label: "Leagues", icon: "leagues" },
];

// The four destinations that get their own mobile bottom-tab; the rest live
// behind the "More" tab, which opens the full drawer.
const PRIMARY = new Set(["/", "/squad", "/players", "/optimizer"]);

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="bg-fpl-logo flex shrink-0 items-center justify-center rounded-[9px] font-bold text-pl-purple"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      FA
    </span>
  );
}

function SidebarTeam() {
  const { entry, promptConnect, disconnect } = useTeam();
  if (entry) {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-white/5 p-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pl-pink text-[11px] font-bold text-white">
            {initials(entry.player_name)}
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-xs font-semibold text-white">
              {entry.player_name ?? entry.team_name ?? `Team ${entry.id}`}
            </span>
            <span className="font-mono text-[10px] text-[#c9a9d1]">
              {entry.overall_rank != null ? `OR ${formatRank(entry.overall_rank)}` : `ID ${entry.id}`}
            </span>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={promptConnect}
            className="flex-1 rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/15"
          >
            Switch
          </button>
          <button
            type="button"
            onClick={disconnect}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-[#c9a9d1] hover:text-white"
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
      className="flex items-center gap-2 rounded-xl bg-white/5 p-2.5 text-sm text-[#d9c4de] transition-colors hover:bg-white/10 hover:text-white"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pl-pink text-[11px] font-bold text-white">
        +
      </span>
      Connect your team
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const current = NAV.find((n) => isActive(pathname, n.href));

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="bg-fpl-sidebar sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col gap-6 border-r border-white/10 px-3.5 py-5 lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2">
          <LogoMark />
          <span className="text-base font-bold text-white">FPL Assistant</span>
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-[9px] px-2.5 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-pl-green font-semibold text-pl-purple"
                    : "font-medium text-[#d9c4de] hover:bg-white/5 hover:text-white"
                }`}
              >
                <NavIcon name={item.icon} className="h-[18px] w-[18px]" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 rounded-xl border border-pl-green/35 bg-pl-green/10 p-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-pl-green">Deadline</span>
            <Countdown className="text-lg font-bold text-white" />
            <span className="text-[11px] text-[#c9a9d1]">{NEXT_DEADLINE_LABEL}</span>
          </div>
          <SidebarTeam />
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="bg-fpl-hero sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3 lg:hidden">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark size={30} />
            <span className="flex flex-col leading-tight">
              <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-pl-green">
                {current?.label ?? "FPL Assistant"}
              </span>
              <span className="text-sm font-semibold text-white">FPL Assistant</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-pl-green/40 bg-pl-green/15 px-2.5 py-1.5">
              <span className="animate-fpl-pulse h-1.5 w-1.5 rounded-full bg-pl-green" />
              <Countdown className="text-xs font-semibold text-white" />
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/10"
            >
              <NavIcon name="menu" className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 bg-surface-sunken pb-20 lg:pb-0">{children}</main>

        {/* Mobile bottom tab bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-stretch border-t border-border bg-white px-1 py-1 lg:hidden">
          {NAV.filter((n) => PRIMARY.has(n.href)).map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-1 rounded-[10px] px-1 py-1.5 text-[10px] font-semibold transition-colors ${
                  active ? "bg-pl-green/15 text-pl-purple" : "text-slate-400"
                }`}
              >
                <NavIcon name={item.icon} className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex flex-1 flex-col items-center gap-1 rounded-[10px] px-1 py-1.5 text-[10px] font-semibold text-slate-400"
          >
            <NavIcon name="menu" className="h-5 w-5" />
            More
          </button>
        </nav>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 animate-fpl-fade"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="bg-fpl-sidebar absolute inset-y-0 left-0 flex w-[264px] flex-col gap-4 p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2.5">
                <LogoMark />
                <span className="text-base font-bold text-white">FPL Assistant</span>
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#d9c4de] hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-[9px] px-2.5 py-2.5 text-sm transition-colors ${
                      active
                        ? "bg-pl-green font-semibold text-pl-purple"
                        : "font-medium text-[#d9c4de] hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <NavIcon name={item.icon} className="h-[18px] w-[18px]" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-white/10 pt-3">
              <SidebarTeam />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
