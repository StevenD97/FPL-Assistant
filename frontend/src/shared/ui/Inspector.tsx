"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * A panel that phases in when the reader picks something to look at, and out
 * again when they're done - so a screen with several deep reads can show one at
 * a time below its subject rather than stacking all of them.
 *
 * It stays in normal flow rather than being a fixed overlay sheet. A fixed
 * sheet is the obvious build, but `position: fixed` is contained by the nearest
 * transformed ancestor, and these panels render inside the page-transition
 * wrapper - which is transformed, so a fixed sheet anchored itself to that
 * instead of the viewport and overflowed the screen. In flow it needs no portal
 * and can't be broken by an ancestor's transform.
 *
 * It spans the full content width and sits beneath the thing it describes, so it
 * doesn't cap its own height or scroll internally: a scroll region nested inside
 * the page scroll is awkward to drive, and there's no column to stay inside any
 * more. It rises rather than slides in, matching where it now appears.
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
  const panelRef = useRef<HTMLElement>(null);

  // Escape closes it, and focus moves onto the panel when it opens so a
  // keyboard reader lands on the thing they just asked for rather than staying
  // behind on the trigger.
  //
  // The scroll happens on every screen size, not just phones. It used to be
  // phone-only because the panel opened beside its subject on desktop and was
  // already in view; now it opens beneath, so a desktop tap would otherwise
  // look like it did nothing too.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

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
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
          className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-white shadow-md outline-none"
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
          {/* Grows with its content and lets the page scroll. It used to scroll
              itself, because as a column beside the pitch it had to stay within
              the column's height; spanning the full width there's nothing to
              stay inside. */}
          <div className="p-4">{children}</div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
