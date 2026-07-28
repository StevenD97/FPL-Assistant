"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { Skeleton } from "@/shared/ui/Skeleton";
import { apiGet } from "@/shared/lib/api";
import type { TeamSummary } from "@/shared/types/api";

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setTeams(await apiGet<TeamSummary[]>("/api/teams"));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    }
    load();
  }, []);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Research"
        title="Teams"
        subtitle="Every Premier League club - open one for its top 5 in goals, xG, assists, xA, points, minutes, discipline, and more."
      />

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {!teams &&
          !error &&
          Array.from({ length: 20 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        {teams?.map((t) => (
          <Link
            key={t.id}
            href={`/teams/${t.id}`}
            className="card-lift flex flex-col items-center gap-2.5 rounded-lg border border-border bg-white px-3 py-5 text-center shadow-sm hover:border-pl-purple/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={t.team_badge}
              alt=""
              className="h-10 w-10 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
              }}
            />
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
