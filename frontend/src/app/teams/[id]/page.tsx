import Link from "next/link";
import { PageContainer } from "@/shared/layout/PageContainer";
import { TeamMetricTabs } from "@/features/teams/TeamMetricTabs";
import { ClubCrest } from "@/features/teams/ClubCrest";
import { apiGet } from "@/shared/lib/api";
import type { TeamDetail } from "@/shared/types/api";

// Per-request, not at build: force-dynamic keeps `next build` from calling the
// backend. See the teams index for the same guard.
export const dynamic = "force-dynamic";


export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data: TeamDetail | null = null;
  let error: string | null = null;
  try {
    data = await apiGet<TeamDetail>(`/api/teams/${id}`);
  } catch (err) {
    error = err instanceof Error ? err.message : "Something went wrong";
  }

  if (error || !data) {
    return (
      <PageContainer>
        <p className="text-sm font-medium text-danger">{error ?? "Team not found"}</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Link href="/teams" className="text-xs font-medium text-text-primary hover:underline">
        &larr; All teams
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <ClubCrest src={data.team_badge} className="h-14 w-14" />
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">{data.name}</h1>
          <p className="text-sm text-text-secondary">
            {data.manager && <>Manager: {data.manager} &middot; </>}
            {data.squad_size} players in the live 2026/27 squad
          </p>
        </div>
      </div>

      {!data.has_season_history && (
        <p className="rounded-md bg-info-bg px-3 py-2 text-sm text-info">
          {data.name} has little to no 2025/26 Premier League history - most of this squad is new to the top
          flight, so these leaderboards will be sparse until the season builds up.
        </p>
      )}

      <TeamMetricTabs metrics={data.metrics} leaderboards={data.leaderboards} />
    </PageContainer>
  );
}
