import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageContainer } from "@/components/layout/PageContainer";
import { NavIcon } from "@/components/nav/icons";
import { Countdown } from "@/components/ui/Countdown";
import { SeasonDataNote } from "@/components/ui/SeasonDataNote";
import { HomeBody } from "@/components/home/HomeBody";
import { getAllPosts } from "@/lib/blog";

export default function LandingPage() {
  const latestPost = getAllPosts()[0];

  return (
    <PageContainer>
      {/* Hero */}
      <div className="bg-fpl-hero relative overflow-hidden rounded-lg p-6 text-white lg:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(0,255,135,0.28),transparent_70%)]" />
        <div className="relative flex flex-col gap-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-pl-green">
            Fantasy Premier League · 2026/27
          </span>
          <h1 className="max-w-3xl text-2xl font-bold leading-[1.05] tracking-tight lg:text-3xl">
            Decisions, not gut feel.
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-[#e6d4ea] lg:text-base">
            Transfer, captaincy, and chip recommendations built on two independent prediction approaches - a
            recommendation score and a full points-per-category model - plus exact optimization for squad and
            transfer decisions.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/squad"
              className="rounded-md bg-pl-green px-4 py-2.5 text-sm font-bold text-pl-purple transition-[filter] hover:brightness-95"
            >
              Connect your team
            </Link>
            <Link
              href="/squad"
              className="rounded-md border border-white/30 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Build a squad
            </Link>
            <span className="flex items-center gap-2 rounded-full border border-pl-green/40 bg-pl-green/10 px-3 py-1.5">
              <span className="animate-fpl-pulse h-1.5 w-1.5 rounded-full bg-pl-green" />
              <span className="text-xs text-[#c9a9d1]">Next deadline</span>
              <Countdown className="text-xs font-semibold text-white" />
            </span>
          </div>
        </div>
      </div>

      {/* Get started / dashboard, depending on connection state */}
      <HomeBody />

      <p className="text-sm text-text-muted">
        <SeasonDataNote mode="blended" /> Fixture and roster data is already live.
      </p>

      {/* Latest blog post */}
      {latestPost && (
        <Link href={`/blog/${latestPost.slug}`} className="group block">
          <Card className="transition-colors group-hover:border-pl-purple/40">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-pl-purple/8 text-pl-purple">
                <NavIcon name="blog" className="h-[18px] w-[18px]" />
              </span>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-pl-green">
                  Latest from the blog
                </span>
                <h2 className="text-md font-semibold text-pl-purple group-hover:underline">{latestPost.title}</h2>
              </div>
            </div>
            <p className="mt-2 text-sm text-text-secondary">{latestPost.excerpt}</p>
          </Card>
        </Link>
      )}

    </PageContainer>
  );
}
