"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { PageContainer } from "@/shared/layout/PageContainer";
import { Skeleton } from "@/shared/ui/Skeleton";
import { TeamLeaderboard } from "@/features/teams/TeamLeaderboard";
import { apiGet } from "@/shared/lib/api";
import type { TeamDetail } from "@/shared/types/api";

// Mirrors the loaded shape: badge + name up top, then a grid of leaderboard
// cards - so the page's shape is stable before the data lands.
function TeamDetailSkeleton() {
  return (
    <PageContainer>
      <Skeleton className="h-4 w-20" />
      <div className="mb-2 flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-52 w-full rounded-lg" />
        ))}
      </div>
    </PageContainer>
  );
}

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        setData(await apiGet<TeamDetail>(`/api/teams/${id}`));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <TeamDetailSkeleton />;
  if (error || !data) {
    return (
      <PageContainer>
        <p className="text-sm font-medium text-danger">{error ?? "Team not found"}</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Link href="/teams" className="text-xs font-medium text-pl-purple hover:underline">
        &larr; All teams
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.team_badge} alt="" className="h-14 w-14 object-contain" />
        <div>
          <h1 className="text-xl font-bold tracking-tight text-pl-purple">{data.name}</h1>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.metrics.map((m) => (
          <TeamLeaderboard key={m.key} metric={m} rows={data.leaderboards[m.key] ?? []} />
        ))}
      </div>
    </PageContainer>
  );
}
