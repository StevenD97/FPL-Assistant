"use client";

import Link from "next/link";
import { useTeam } from "@/shared/team/TeamProvider";
import { useShortlist } from "@/shared/lib/shortlist";
import { Card } from "@/shared/ui/Card";
import { GetStartedSteps } from "@/features/home/GetStartedSteps";
import { Dashboard } from "@/features/home/Dashboard";

// Landing page's job changes once a manager is connected: a new visitor
// needs walking through setup (GetStartedSteps), a returning one wants
// their own numbers front and centre (Dashboard) instead of being asked
// to set up again. The shortlist teaser threads the personal watchlist onto
// the landing page whenever it has entries.
export function HomeBody() {
  const { entry } = useTeam();
  const shortlist = useShortlist();

  return (
    <div className="flex flex-col gap-6">
      {entry ? <Dashboard /> : <GetStartedSteps />}

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
