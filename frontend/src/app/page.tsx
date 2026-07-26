import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageContainer } from "@/components/layout/PageContainer";
import { NavIcon, type IconName } from "@/components/nav/icons";
import { Countdown } from "@/components/ui/Countdown";
import { SeasonDataNote } from "@/components/ui/SeasonDataNote";
import { NEXT_DEADLINE_LABEL } from "@/lib/deadline";

type PageInfo = {
  title: string;
  href: string;
  icon: IconName;
  what: string;
  model: string;
  use: string;
};

const PAGES: PageInfo[] = [
  {
    title: "Optimizer",
    href: "/optimizer",
    icon: "optimizer",
    what: "The provably optimal squad (from scratch) or transfers (from your real squad), solved exactly rather than ranked.",
    model: "Integer linear programming over predicted points, respecting FPL's real rules (budget, formation, max 3 per club) and weighing transfer hits against points gained.",
    use: "When you want the mathematically best answer rather than a manually-built one - compare its output against your own Squad Builder draft.",
  },
  {
    title: "Squad Builder",
    href: "/squad-builder",
    icon: "squad-builder",
    what: "Manually draft a 15-man squad within budget on a visual pitch, with live feedback as you go.",
    model: "Predicted points from the Outlook model, plus rule-based diagnostics (club concentration, missing good fixture runs, no penalty taker, etc).",
    use: "For planning a Wildcard or a new squad by hand, with the app flagging risks and suggesting fixes as you build.",
  },
  {
    title: "Players",
    href: "/players",
    icon: "players",
    what: "Every player in the game - searchable, sortable by predicted points, cost, value, or ownership.",
    model: "Predicted points from the same team-strength model as Outlook. Click any player for full detail.",
    use: "The starting point for building a squad from scratch - filter by position and sort by value or predicted points.",
  },
  {
    title: "Outlook",
    href: "/outlook",
    icon: "outlook",
    what: "Predicted points summed over a run of gameweeks, ranked across all players.",
    model: "A Dixon-Coles-style model: each team's recency-weighted attack/defence strength predicts expected goals for a fixture, split across players by their historical share of goals/assists, plus separately modeled bonus, cards, saves, and defensive contribution.",
    use: "For transfer targets over a run of fixtures - a multi-week window tracks reality noticeably better than any one gameweek.",
  },
  {
    title: "Differentials",
    href: "/differentials",
    icon: "differentials",
    what: "High-scoring players with low ownership.",
    model: "The same recommendation_score as My Squad, filtered to a chosen ownership ceiling.",
    use: "Hunting for rank-gaining picks when you need to close a gap in a mini-league.",
  },
  {
    title: "Fixtures",
    href: "/fixtures",
    icon: "fixtures",
    what: "Every team's next 5 gameweeks, ranked easiest to hardest, with a color-coded difficulty chip per fixture.",
    model: "FPL's own fixture-difficulty ratings (FDR) - no prediction model, just the live fixture calendar.",
    use: "Check before a Wildcard or when picking which teams to target for transfers/captaincy.",
  },
  {
    title: "Schedule",
    href: "/schedule",
    icon: "schedule",
    what: "The full season's fixture list, one gameweek at a time, with results once played.",
    model: "Live fixture data only.",
    use: "Browse what's on in a given gameweek, or look back at a result.",
  },
  {
    title: "Chips",
    href: "/chips",
    icon: "chips",
    what: "Suggested timing for Bench Boost, Triple Captain, Free Hit, and Wildcard.",
    model: "Scans a gameweek window scoring your squad/bench each week, and separately detects league-wide blank/double gameweeks from the fixture calendar.",
    use: "Check a few gameweeks out from a decision point to see if a cluster of good fixtures or a blank/double gameweek is coming up.",
  },
  {
    title: "Leagues",
    href: "/leagues",
    icon: "leagues",
    what: "Your classic mini-leagues, their standings, and a gameweek-by-gameweek score trend line per manager.",
    model: "Live league standings and history from the FPL API - no prediction involved.",
    use: "Track your rank and form against the rest of a mini-league across the season.",
  },
];

export default function LandingPage() {
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
              href="/squad-builder"
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

      {/* Featured: My Squad */}
      <Link href="/squad" className="group block">
        <div className="bg-fpl-pitch relative overflow-hidden rounded-lg p-6 text-white transition-transform duration-fast ease-standard group-hover:scale-[1.01] lg:p-8">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/40 via-black/10 to-transparent" />
          <div className="relative flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/15 text-white">
                <NavIcon name="squad" className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-pl-green">
                Start here
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight lg:text-2xl">My Squad</h2>
            <p className="max-w-2xl text-sm leading-relaxed text-white/90 lg:text-base">
              Your real squad, on a real pitch - with official club badges, kits, and player photos. See your
              team scored gameweek by gameweek, get automatically-suggested transfers, and click any player for
              their full breakdown.
            </p>
            <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md bg-pl-green px-4 py-2.5 text-sm font-bold text-pl-purple transition-[filter] group-hover:brightness-95">
              Go to My Squad →
            </span>
          </div>
        </div>
      </Link>

      <p className="text-sm text-text-muted">
        <SeasonDataNote mode="blended" /> Fixture and roster data is already live.
      </p>

      {/* Explore grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PAGES.map((page) => (
          <Card key={page.href} padded={false} className="group flex flex-col p-4 transition-colors hover:border-pl-purple/40">
            <Link href={page.href} className="flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-pl-purple/8 text-pl-purple transition-colors group-hover:bg-pl-green group-hover:text-pl-purple">
                  <NavIcon name={page.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="text-md font-semibold text-pl-purple group-hover:underline">{page.title}</span>
              </div>
              <p className="text-sm text-text-primary">{page.what}</p>
              <p className="text-xs text-text-secondary">
                <span className="font-semibold text-text-muted">Model: </span>
                {page.model}
              </p>
              <p className="text-xs text-text-secondary">
                <span className="font-semibold text-text-muted">Use it for: </span>
                {page.use}
              </p>
            </Link>
          </Card>
        ))}
      </div>

      <p className="pt-2 text-center text-xs text-text-muted">GW1 · {NEXT_DEADLINE_LABEL.replace("GW1 · ", "")}</p>
    </PageContainer>
  );
}
