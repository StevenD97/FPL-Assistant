"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { STAT_GLOSSARY, type StatGlossaryKey } from "@/shared/lib/statGlossary";

type Coords = { top: number; left: number; placement: "top" | "bottom" };

type InfoTooltipProps = {
  /** Key into STAT_GLOSSARY for the standard, reusable explanations. */
  term?: StatGlossaryKey;
  /** One-off explanation text, for labels that come from API data rather than a fixed term. */
  text?: string;
  /** Accessible name for the trigger; defaults to "What does {term} mean?". */
  label?: string;
  className?: string;
};

// Small "i" trigger that shows a short explanation: on hover for pointer/desktop
// users, on tap for touch/mobile (no hover state), via click/focus either way.
// Renders as a <span role="button"> (not a real <button>) so it's safe to nest
// inside cards that are themselves a <Link>/<a>.
export function InfoTooltip({ term, text, label, className = "" }: InfoTooltipProps) {
  const content = text ?? (term ? STAT_GLOSSARY[term] : undefined);
  // Hover/focus and click are tracked separately (not one shared boolean): a
  // tap on a touch device can fire a synthetic mouseenter immediately before
  // its click, and if both toggled the same flag the click would flip it
  // straight back to closed. Visibility is the union of the two instead.
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  const visible = hovered || clicked;
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!visible) return;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const placement: Coords["placement"] = window.innerHeight - rect.bottom < 90 ? "top" : "bottom";
      // Half the tooltip's max-width (220px) plus a small margin, so the
      // centered bubble never clips past either edge of narrow viewports.
      const halfWidth = 114;
      const left = Math.min(Math.max(rect.left + rect.width / 2, halfWidth), window.innerWidth - halfWidth);
      const top = placement === "bottom" ? rect.bottom + 6 : rect.top - 6;
      setCoords({ top, left, placement });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    function handleOutside(event: MouseEvent | TouchEvent) {
      if (triggerRef.current?.contains(event.target as Node)) return;
      setHovered(false);
      setClicked(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setHovered(false);
        setClicked(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [visible]);

  if (!content) return null;

  return (
    <span className="relative inline-flex">
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-label={label ?? "More info"}
        aria-expanded={visible}
        aria-describedby={visible ? tooltipId : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setClicked((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          setClicked((value) => !value);
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={`tap-target inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-400 text-[9px] font-bold leading-none text-text-muted transition-colors hover:border-pl-purple hover:bg-pl-purple hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pl-purple ${className}`}
      >
        i
      </span>
      {visible &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              transform: `translate(-50%, ${coords.placement === "bottom" ? "0" : "-100%"})`,
            }}
            className="z-[100] block w-max max-w-[220px] text-pretty rounded-md bg-pl-purple-dark px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white shadow-lg"
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}
