"use client";

import { useTeam } from "@/components/team/TeamProvider";
import { GetStartedSteps } from "@/components/home/GetStartedSteps";
import { Dashboard } from "@/components/home/Dashboard";

// Landing page's job changes once a manager is connected: a new visitor
// needs walking through setup (GetStartedSteps), a returning one wants
// their own numbers front and center (Dashboard) instead of being asked
// to set up again.
export function HomeBody() {
  const { entry } = useTeam();
  return entry ? <Dashboard /> : <GetStartedSteps />;
}
