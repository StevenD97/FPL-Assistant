"use client";

import Link from "next/link";
import { useTeam } from "@/shared/team/TeamProvider";
import { useShortlist } from "@/shared/lib/shortlist";
import { Card } from "@/shared/ui/Card";
import { GetStartedSteps } from "@/features/home/GetStartedSteps";

// What sits under the top of the landing page. A new visitor still needs
// walking through setup; a connected manager doesn't, because their numbers
// are now the hero itself (HomeLanding -> HomeCockpit) rather than a strip
// below a marketing pitch. The shortlist teaser threads the personal watchlist
// on for either.
export function HomeBody() {
  const { entry } = useTeam();
  const shortlist = useShortlist();

  return (
    <div className="flex flex-col gap-6">
      {!entry && <GetStartedSteps />}

      {shortlist.length > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-lg text-pl-yellow" aria-hidden="true">
              ★
            </span>
            <span className="text-sm text-text-secondary">
              <span className="font-semibold text-text-primary">{shortlist.length}</span> player
              {shortlist.length === 1 ? "" : "s"} on your shortlist
            </span>
          </div>
          <Link href="/players?view=shortlist" className="text-sm font-semibold text-pl-purple hover:underline">
            View shortlist →
          </Link>
        </Card>
      )}
    </div>
  );
}
