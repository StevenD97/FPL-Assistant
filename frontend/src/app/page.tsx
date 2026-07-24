import Link from "next/link";
import { Card } from "@/components/ui/Card";

type PageInfo = {
  title: string;
  href: string;
  what: string;
  model: string;
  use: string;
};

const PAGES: PageInfo[] = [
  {
    title: "Fixtures",
    href: "/fixtures",
    what: "Every team's next 5 gameweeks, ranked easiest to hardest, with a color-coded difficulty chip per fixture.",
    model: "FPL's own fixture-difficulty ratings (FDR) - no prediction model, just the live fixture calendar.",
    use: "Check before a Wildcard or when picking which teams to target for transfers/captaincy.",
  },
  {
    title: "Schedule",
    href: "/schedule",
    what: "The full season's fixture list, one gameweek at a time, with results once played.",
    model: "Live fixture data only.",
    use: "Browse what's on in a given gameweek, or look back at a result.",
  },
  {
    title: "Players",
    href: "/players",
    what: "Every player in the game - searchable, sortable by predicted points, cost, value, or ownership.",
    model: "Predicted points from the same team-strength model as Outlook (below). Click any player for full detail.",
    use: "The starting point for building a squad from scratch - filter by position and sort by value or predicted points.",
  },
  {
    title: "Outlook",
    href: "/outlook",
    what: "Predicted points summed over a run of gameweeks, ranked across all players.",
    model: "A Dixon-Coles-style model: each team's recency-weighted attack/defence strength predicts expected goals for a fixture, then that's split across players by their historical share of goals/assists, plus separately modeled bonus, cards, saves, and defensive contribution.",
    use: "For transfer targets over a run of fixtures, not a single-week promise - a multi-week window tracks reality noticeably better than any one gameweek.",
  },
  {
    title: "My Squad",
    href: "/squad",
    what: "Enter your FPL team ID to see your current squad scored, plus automatically-suggested transfers.",
    model: "A separate recommendation_score blending expected returns, recency-weighted form, underlying quality (xG/ICT), fixture difficulty, and set-piece duty - the transfer suggestions come from the same optimizer as the Optimizer page.",
    use: "Check your squad's weak points and see the provably optimal transfer(s) given your bank and free transfers.",
  },
  {
    title: "Squad Builder",
    href: "/squad-builder",
    what: "Manually draft a 15-man squad within budget on a visual pitch, with live feedback as you go.",
    model: "Predicted points from the Outlook model, plus rule-based diagnostics (club concentration, missing good fixture runs, no penalty taker, etc).",
    use: "For planning a Wildcard or a new squad by hand, with the app flagging risks and suggesting fixes as you build.",
  },
  {
    title: "Optimizer",
    href: "/optimizer",
    what: "The provably optimal squad (from scratch) or transfers (from your real squad), solved exactly rather than ranked.",
    model: "Integer linear programming over predicted points, respecting FPL's real rules (budget, formation, max 3 per club) and weighing transfer hits against points gained.",
    use: "When you want the mathematically best answer rather than a manually-built one - compare its output against your own Squad Builder draft.",
  },
  {
    title: "Differentials",
    href: "/differentials",
    what: "High-scoring players with low ownership.",
    model: "The same recommendation_score as My Squad, filtered to a chosen ownership ceiling.",
    use: "Hunting for rank-gaining picks when you need to close a gap in a mini-league.",
  },
  {
    title: "Chips",
    href: "/chips",
    what: "Suggested timing for Bench Boost, Triple Captain, Free Hit, and Wildcard.",
    model: "Scans a gameweek window scoring your squad/bench each week, and separately detects league-wide blank/double gameweeks from the fixture calendar.",
    use: "Check a few gameweeks out from a decision point to see if a cluster of good fixtures or a blank/double gameweek is coming up.",
  },
  {
    title: "Leagues",
    href: "/leagues",
    what: "Your classic mini-leagues, their standings, and a gameweek-by-gameweek score trend line per manager.",
    model: "Live league standings and history from the FPL API - no prediction involved.",
    use: "Track your rank and form against the rest of a mini-league across the season.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 font-sans text-3xl font-bold text-pl-purple">FPL Assistant</h1>
        <p className="mb-4 max-w-2xl text-text-secondary">
          Transfer, captaincy, and chip recommendations for Fantasy Premier League - built on two independent
          prediction approaches (a recommendation score, and a full points-per-category model) plus exact
          optimization for squad and transfer decisions, rather than gut feel.
        </p>
        <p className="mb-10 text-sm text-text-muted">
          Player-scoring pages currently use 2025/26 demo data until FPL resets stats for the live 2026/27 season;
          fixture and roster data is already live.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PAGES.map((page) => (
            <Card key={page.href} className="flex flex-col">
              <Link href={page.href} className="mb-1 font-sans text-lg font-semibold text-pl-purple hover:underline">
                {page.title}
              </Link>
              <p className="mb-2 text-sm text-text-primary">{page.what}</p>
              <p className="mb-2 text-xs text-text-secondary">
                <span className="font-semibold text-text-muted">Model: </span>
                {page.model}
              </p>
              <p className="text-xs text-text-secondary">
                <span className="font-semibold text-text-muted">Use it for: </span>
                {page.use}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
