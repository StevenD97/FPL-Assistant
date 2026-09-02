import Link from "next/link";
import type { ReactNode } from "react";

// live_id is null when a player has no live-2026/27 match (retired, or
// left the Premier League) - render plain text rather than a dead link.
export function PlayerLink({
  id,
  children,
  className = "",
}: {
  id?: number | null;
  children: ReactNode;
  className?: string;
}) {
  if (id == null) return <>{children}</>;
  return (
    // tap-target: a player's name is the whole point of the row it sits in,
    // and a 19px line of text is not a thumb target. The hit area grows to
    // 44px on coarse pointers without moving the text - see globals.css.
    <Link href={`/players/${id}`} className={`tap-target hover:underline ${className}`}>
      {children}
    </Link>
  );
}
