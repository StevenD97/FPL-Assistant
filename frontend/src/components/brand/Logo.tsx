"use client";

import { useId } from "react";

type LogoProps = {
  /** 'full' = badge + wordmark (default), 'mark' = badge only (favicon, avatars, collapsed rail) */
  variant?: "full" | "mark";
  /** 'dark' = for dark/purple backgrounds (default), 'light' = for white backgrounds */
  tone?: "dark" | "light";
  /** badge height in px; wordmark scales from it. default 37 */
  size?: number;
  className?: string;
};

// Hexagon badge geometry - fixed 200x220 viewBox, do not redraw.
const BADGE_PATH =
  "M119.9 19.5 L168.4 47.5 Q188.3 59 188.3 82 L188.3 138 Q188.3 161 168.4 172.5 L119.9 200.5 Q100 212 80.1 200.5 L31.6 172.5 Q11.7 161 11.7 138 L11.7 82 Q11.7 59 31.6 47.5 L80.1 19.5 Q100 8 119.9 19.5 Z";
const ASPECT_RATIO = 200 / 220;

// Outline weight scales inversely with rendered size so it stays optically even.
function strokeWidthFor(size: number): number {
  if (size >= 56) return 12;
  if (size >= 30) return 15;
  return 19;
}

export function Logo({ variant = "full", tone = "dark", size = 37, className = "" }: LogoProps) {
  const gradientId = useId();
  const width = size * ASPECT_RATIO;
  const strokeWidth = strokeWidthFor(size);
  const scale = size / 37;

  const innerXColor = tone === "dark" ? "#FFFFFF" : "#8B4DFF";

  return (
    <span role="img" aria-label="xFPL" className={`inline-flex items-center ${className}`} style={{ gap: size * 0.27 }}>
      <span className="relative inline-block shrink-0" style={{ width, height: size }}>
        <svg viewBox="0 0 200 220" width={width} height={size} fill="none" aria-hidden="true">
          {tone === "dark" && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#B98CFF" />
                <stop offset="50%" stopColor="#8B4DFF" />
                <stop offset="100%" stopColor="#6D28D9" />
              </linearGradient>
            </defs>
          )}
          <path
            d={BADGE_PATH}
            stroke={tone === "dark" ? `url(#${gradientId})` : "#37003C"}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </svg>
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center"
          style={{
            fontFamily: "var(--font-geist-sans)",
            fontWeight: 700,
            fontSize: size * 0.46,
            lineHeight: 1,
            color: innerXColor,
            transform: `skewX(-11deg) translate(${1 * scale}px, ${0.5 * scale}px)`,
          }}
        >
          x
        </span>
      </span>

      {variant === "full" && (
        <span
          aria-hidden="true"
          className="inline-block"
          style={{
            fontFamily: "var(--font-geist-sans)",
            fontWeight: 700,
            fontSize: size * 0.57,
            lineHeight: 1,
            letterSpacing: "-0.035em",
            transform: "skewX(-11deg)",
          }}
        >
          <span style={{ color: innerXColor }}>x</span>
          <span style={{ color: tone === "dark" ? "#FFFFFF" : "#37003C" }}>FPL</span>
        </span>
      )}
    </span>
  );
}
