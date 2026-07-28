import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { MatchesTabs } from "@/features/matches/MatchesTabs";
import { apiGet } from "@/shared/lib/api";
import type { FixtureDifficultyRow, ScheduleFixture } from "@/shared/types/api";

// Per-request, not at build: force-dynamic keeps `next build` from calling the
// backend. Same guard as the landing page.
export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  // Both tabs' data in parallel - the toggle is instant and neither view
  // fetches when you switch to it.
  const [fixtures, difficulty] = await Promise.all([
    apiGet<ScheduleFixture[]>("/api/fixtures/schedule").catch(() => [] as ScheduleFixture[]),
    apiGet<FixtureDifficultyRow[]>("/api/fixtures/difficulty?start_event=1&window_size=5").catch(
      () => [] as FixtureDifficultyRow[],
    ),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Matches"
        subtitle="2026/27 fixtures, results, and difficulty - gameweek by gameweek."
      />
      <MatchesTabs fixtures={fixtures} difficulty={difficulty} />
    </PageContainer>
  );
}
