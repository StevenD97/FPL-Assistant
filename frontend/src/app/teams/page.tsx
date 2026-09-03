import Link from "next/link";
import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { ClubCrest } from "@/features/teams/ClubCrest";
import { apiGet } from "@/shared/lib/api";
import type { TeamSummary } from "@/shared/types/api";

// Fetched per request rather than at build time. force-dynamic keeps `next
// build` from calling the backend, which would fail the deploy whenever the
// backend is briefly unreachable - same guard as the landing page.
export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  let teams: TeamSummary[] = [];
  let error: string | null = null;
  try {
    teams = await apiGet<TeamSummary[]>("/api/teams");
  } catch (err) {
    error = err instanceof Error ? err.message : "Something went wrong";
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Research"
        title="Teams"
        subtitle="Every Premier League club - open one for its top 5 in goals, xG, assists, xA, points, minutes, discipline, and more."
      />

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {teams.map((t) => (
          <Link
            key={t.id}
            href={`/teams/${t.id}`}
            className="card-lift flex flex-col items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-5 text-center shadow-sm hover:border-brand/40"
          >
            <ClubCrest src={t.team_badge} />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-sm font-semibold text-text-primary">{t.name}</span>
              {t.manager && <span className="text-xs text-text-muted">{t.manager}</span>}
            </div>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
