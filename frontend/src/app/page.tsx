import Link from "next/link";
import { PageContainer } from "@/shared/layout/PageContainer";
import { SeasonDataNote } from "@/shared/ui/SeasonDataNote";
import { HeroActions } from "@/features/home/HeroActions";
import { HomeBody } from "@/features/home/HomeBody";
import { HomeLanding } from "@/features/home/HomeLanding";
import { WorkedExample } from "@/features/home/WorkedExample";
import { MatchdayStrip } from "@/features/home/MatchdayStrip";
import { BlogCover } from "@/features/blog/BlogCover";
import { DiscordCTA } from "@/shared/ui/DiscordCTA";
import { getRecentPosts } from "@/shared/lib/blog";
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
  // Recent posts only. A five-week-old pre-season note featured under "From
  // the blog" with no visible date is worse than no blog strip at all - see
  // getRecentPosts.
  const posts = getRecentPosts(3);
  const matchday = await getMatchday();

  return (
    <PageContainer>
      {/* A connected manager gets their cockpit here instead of the marketing
          hero. The hero is passed in as a prop so it stays server-rendered for
          the visitors it's actually for. */}
      <HomeLanding
        hero={
          <div className="bg-fpl-hero relative overflow-hidden rounded-lg p-6 text-white lg:p-8">
            <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(255,176,32,0.16),transparent_70%)]" />
            <div className="relative flex flex-col gap-4">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-text-primary">
                Fantasy Premier League · 2026/27
              </span>
              {/* The headline is the differentiator, not the category. "Decisions,
                  not gut feel" is what every tool in this space claims; being
                  able to read why, in a sentence assembled from the figures
                  that decided it, is what none of them offer - including the
                  official game's own assistant, which writes prose about a
                  number rather than out of it. */}
              <h1 className="max-w-3xl text-2xl font-bold leading-[1.05] tracking-tight lg:text-3xl">
                Every recommendation, explained in a sentence.
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-ink-100 lg:text-base">
                Transfers, captaincy and chip timing for Fantasy Premier League - each one stated
                with the reasoning that produced it, the range it might land in, and a public
                record of how the last call actually went. Nothing here is written by a language
                model; every number in the sentence is one the model computed.
              </p>
              <HeroActions />
            </div>
          </div>
        }
      />

      {/* Guided setup for a new visitor, plus the shortlist teaser. The
          connected manager's numbers now live in the cockpit above. */}
      <HomeBody workedExample={<WorkedExample />} />

      {/* Matchday */}
      {matchday && <MatchdayStrip event={matchday.event} fixtures={matchday.fixtures} />}

      {/* Latest from the blog */}
      {posts.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-text-primary">From the blog</span>
            <Link href="/blog" className="tap-target inline-flex items-center text-xs font-semibold text-text-primary hover:underline">
              All posts →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group card-lift block overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
              >
                <BlogCover cover={post.cover} size="card" />
                <div className="p-3.5">
                  <div className="text-xs text-text-muted">{formatDate(post.date)}</div>
                  <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-text-primary group-hover:underline">
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
