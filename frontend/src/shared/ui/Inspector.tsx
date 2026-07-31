"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * A panel that phases in when the reader picks something to look at, and out
 * again when they're done - so a screen with several deep reads can show one at
 * a time beside its subject rather than stacking all of them.
 *
 * It stays in normal flow rather than being a fixed overlay sheet. A fixed
 * sheet is the obvious build, but `position: fixed` is contained by the nearest
 * transformed ancestor, and these panels render inside the page-transition
 * wrapper - which is transformed, so a fixed sheet anchored itself to that
 * instead of the viewport and overflowed the screen. In flow it needs no portal
 * and can't be broken by an ancestor's transform. On a phone the single-column
 * layout makes it full width anyway, which is what a side panel becomes there.
 */
export function Inspector({
  open,
  title,
  eyebrow,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  /** Small label above the content, e.g. which team this read is about. */
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const isDesktop = useIsDesktop();
  const panelRef = useRef<HTMLElement>(null);

  // Escape closes it, and focus moves onto the panel when it opens so a
  // keyboard reader lands on the thing they just asked for rather than staying
  // behind on the trigger. On a phone the panel opens below the fold, so bring
  // it into view too - otherwise a tap looks like it did nothing.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    if (!isDesktop) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, isDesktop]);

  // A keyed motion child directly inside AnimatePresence. Wrapping it in a
  // Fragment reads more tidily but AnimatePresence can't track a Fragment's
  // presence, so the exit never fires and the panel stays mounted for good.
  return (
    <AnimatePresence>
      {open && (
        <motion.section
          key="inspector-panel"
          ref={panelRef}
          tabIndex={-1}
          aria-label={title}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
          className="flex flex-col overflow-hidden rounded-lg border border-border bg-white shadow-md outline-none lg:max-h-[42rem]"
        >
          {/* The panel is chrome, not a second heading: every read already
              titles itself, so a title here would say it twice. `title` still
              names the region for assistive tech and labels the close button;
              the strip carries the subject (which team) and the way out. */}
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
            <p className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted">
              {eyebrow}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${title}`}
              className="-mr-1 shrink-0 rounded-md p-1.5 text-text-muted transition-colors duration-fast ease-standard hover:bg-surface-sunken hover:text-text-primary"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                aria-hidden="true"
                className="h-4 w-4"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>
          {/* Scrolls itself rather than the page: on desktop the panel is a
              column beside the pitch, so its content has to stay in bounds. */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

/**
 * lg breakpoint, matching the Tailwind default the layout switches on. A media
 * query is an external store, so it's subscribed to as one rather than mirrored
 * into state from an effect (which would fire a cascading render on mount).
 */
const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeToDesktopQuery(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeToDesktopQuery,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}
