import Link from "next/link";
import type { ReactNode } from "react";

// live_id is null when a player has no live-2026/27 match (retired, or
// left the Premier League) - render plain text rather than a dead link.
export function PlayerLink({ id, children }: { id?: number | null; children: ReactNode }) {
  if (id == null) return <>{children}</>;
  return (
    <Link href={`/players/${id}`} className="hover:underline">
      {children}
    </Link>
  );
}
