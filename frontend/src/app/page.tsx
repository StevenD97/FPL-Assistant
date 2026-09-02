import Link from "next/link";
import { PageContainer } from "@/shared/layout/PageContainer";
import { SeasonDataNote } from "@/shared/ui/SeasonDataNote";
import { HeroActions } from "@/features/home/HeroActions";
import { HomeBody } from "@/features/home/HomeBody";
import { HomeLanding } from "@/features/home/HomeLanding";
import { MatchdayStrip } from "@/features/home/MatchdayStrip";
import { BlogCover } from "@/features/blog/BlogCover";
import { DiscordCTA } from "@/shared/ui/DiscordCTA";
import { getAllPosts } from "@/shared/lib/blog";
import { apiGet } from "@/shared/lib/api";
import { currentEvent } from "@/shared/lib/fixtureState";
import type { ScheduleFixture } from "@/shared/types/api";

// Fetches live matchday fixtures at request time; force-dynamic keeps Next
// from calling the backend at build time (which would fail the deploy if the
// backend is briefly unreachable - see the Fixtures page for the same guard).
export const dynamic = "force-dynamic";


async function getMatchday(): Promise<{ event: number; fixtures: ScheduleFixture[] } | null> {
  try {
    const all = await apiGet<ScheduleFixture[]>("/api/fixtures/schedule", { cache: "no-store" });
    if (!all.length) return null;
    // Feature the next gameweek still to be played (fall back to the last).
    const nextEvent = currentEvent(all) ?? all[all.length - 1].event;
    return { event: nextEvent, fixtures: all.filter((f) => f.event === nextEvent).slice(0, 10) };
  } catch {
    return null;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function LandingPage() {
  const posts = getAllPosts().slice(0, 3);
  const matchday = await getMatchday();

  return (
    <PageContainer>
      {/* A connected manager gets their cockpit here instead of the marketing
          hero. The hero is passed in as a prop so it stays server-rendered for
          the visitors it's actually for. */}
      <HomeLanding
        hero={
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
              <HeroActions />
            </div>
          </div>
        }
      />

      {/* Guided setup for a new visitor, plus the shortlist teaser. The
          connected manager's numbers now live in the cockpit above. */}
      <HomeBody />

      {/* Matchday */}
      {matchday && <MatchdayStrip event={matchday.event} fixtures={matchday.fixtures} />}

      {/* Latest from the blog */}
      {posts.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-pl-green">From the blog</span>
            <Link href="/blog" className="text-xs font-semibold text-pl-purple hover:underline">
              All posts →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group card-lift block overflow-hidden rounded-lg border border-border bg-white shadow-sm"
              >
                <BlogCover cover={post.cover} size="card" />
                <div className="p-3.5">
                  <div className="text-[11px] text-text-muted">{formatDate(post.date)}</div>
                  <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-pl-purple group-hover:underline">
                    {post.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-3 text-xs text-text-secondary">{post.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <DiscordCTA />

      <p className="text-sm text-text-muted">
        <SeasonDataNote mode="blended" /> Fixture and roster data is already live.
      </p>
    </PageContainer>
  );
}
