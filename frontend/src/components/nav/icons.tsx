// Minimal inline stroke icons for the nav, keyed by route slug. Kept
// dependency-free (no icon library) - each is a 24x24 currentColor glyph.
import type { SVGProps } from "react";

type IconName =
  | "home"
  | "squad"
  | "players"
  | "outlook"
  | "differentials"
  | "price-watch"
  | "fixtures"
  | "schedule"
  | "chips"
  | "leagues"
  | "menu";

const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5M9.5 20v-6h5v6" />,
  squad: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  players: <path d="M4 6h16M4 12h16M4 18h16" />,
  outlook: <path d="M4 19V5M4 19h16M7 15l3.5-4 3 2.5L20 7" />,
  differentials: <path d="M12 2 4 12l8 10 8-10z" />,
  "price-watch": <path d="M7 17V7m0 0-3 3m3-3 3 3M17 7v10m0 0-3-3m3 3 3-3" />,
  fixtures: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3M8.5 14.5l2.2 2.2 4-4.2" />
    </>
  ),
  schedule: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3M8 13h3M8 17h8M13 13h3" />
    </>
  ),
  chips: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 6V3.5M15 6V3.5M9 20.5V18M15 20.5V18M6 9H3.5M6 15H3.5M20.5 9H18M20.5 15H18" />
    </>
  ),
  leagues: (
    <>
      <path d="M7 4h10v4a5 5 0 0 1-10 0zM7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3M9 20h6M12 13v7" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
};

export function NavIcon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}

export type { IconName };
