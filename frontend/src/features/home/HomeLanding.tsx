"use client";

import { useTeam } from "@/shared/team/TeamProvider";
import { HomeCockpit } from "./HomeCockpit";

/**
 * Decides what tops the landing page. A signed-out visitor gets the marketing
 * hero; a connected manager gets their cockpit instead, because someone who has
 * already signed up doesn't need to be sold the product every visit.
 *
 * `hero` arrives as a prop rather than being imported so it stays a Server
 * Component - it's the version that matters for a first-time visitor and for
 * indexing, so it should be in the HTML rather than waiting on hydration.
 *
 * The swap keys off `status === "loading"` as well as `teamId`, because teamId
 * is only set once /api/entry resolves. Waiting for that would flash the
 * marketing hero at a returning manager for the length of a network call;
 * "loading" means a stored id was found, which is enough to commit to the
 * cockpit and let it show its own skeleton.
 */
export function HomeLanding({ hero }: { hero: React.ReactNode }) {
  const { teamId, status } = useTeam();
  const connected = teamId != null || status === "loading";

  return connected ? <HomeCockpit /> : <>{hero}</>;
}
