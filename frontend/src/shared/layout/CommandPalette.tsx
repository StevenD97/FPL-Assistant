"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { NavIcon, type IconName } from "./icons";

type Cmd = { label: string; href: string; icon: IconName; keywords?: string };

// Keep roughly in sync with AppShell's NAV.
const COMMANDS: Cmd[] = [
  { label: "Home", href: "/", icon: "home" },
  { label: "My Squad", href: "/squad", icon: "squad", keywords: "build optimize transfers team draft chips wildcard bench boost triple captain free hit" },
  { label: "Players", href: "/players", icon: "players", keywords: "search browse database outlook predicted points differentials low ownership" },
  { label: "Teams", href: "/teams", icon: "teams", keywords: "clubs top 5 goals assists xg xa xgi minutes bonus cards leaderboard" },
  { label: "Price Watch", href: "/price-watch", icon: "price-watch", keywords: "rises falls transfers momentum" },
  { label: "Accuracy", href: "/accuracy", icon: "accuracy", keywords: "track record graded backtest how good hit rate" },
  { label: "Matches", href: "/matches", icon: "fixtures", keywords: "fixtures schedule results difficulty fdr calendar" },
  { label: "Leagues", href: "/leagues", icon: "leagues", keywords: "mini standings rivals" },
  { label: "Blog", href: "/blog", icon: "blog", keywords: "news posts" },
];

export const OPEN_PALETTE_EVENT = "xfpl:open-command-palette";

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return COMMANDS;
    return COMMANDS.filter((c) => `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(s));
  }, [q]);

  useEffect(() => setActive(0), [q]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[active];
      if (r) go(r.href);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setOpen(false)} aria-hidden="true" />
          <motion.div
            className="bg-fpl-sidebar relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 shadow-lg"
            initial={{ y: -12, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-4">
              <span className="text-ink-300" aria-hidden="true">⌕</span>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Jump to…  (players, chips, differentials)"
                className="w-full bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-ink-400"
              />
              <kbd className="rounded bg-surface/10 px-1.5 py-0.5 font-mono text-[10px] text-ink-300">esc</kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {results.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-ink-400">No matches.</p>
              )}
              {results.map((c, i) => (
                <button
                  key={c.href}
                  type="button"
                  onClick={() => go(c.href)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    i === active ? "bg-brand font-semibold text-ink-900" : "text-ink-200"
                  }`}
                >
                  <NavIcon name={c.icon} className="h-[18px] w-[18px]" />
                  {c.label}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
