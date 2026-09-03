"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiGet } from "@/shared/lib/api";
import type { CaptainReview as CaptainReviewResponse } from "@/shared/types/api";

/**
 * What last week's armband actually cost you.
 *
 * The accuracy page proves the model is worth listening to in general, which is
 * a statistic about a stranger's team. This is the same argument aimed at the
 * reader: "you captained Palmer, we said B.Fernandes, that was 21 points". A
 * manager will remember the second one, and nobody else in the category makes
 * it - the official assistant answers for eleven million people at once and
 * cannot tell any of them what a specific decision of theirs was worth.
 *
 * It renders whichever way the comparison went. A panel that only appears in
 * the weeks the model was right is an advertisement, and the whole reason this
 * carries weight is that the record it sits next to includes the misses.
 */
export function CaptainReview({ teamId }: { teamId: number | null }) {
  const [review, setReview] = useState<CaptainReviewResponse | null>(null);

  useEffect(() => {
    if (teamId == null) return;
    let cancelled = false;
    apiGet<CaptainReviewResponse>(`/api/entry/${teamId}/captain-review`)
      .then((r) => {
        if (!cancelled) setReview(r);
      })
      // A missing review is not worth an error state - the panel just doesn't
      // appear, which is what it does for an ungradeable week anyway.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  if (!review?.available) return null;

  const { agreed, points_delta: delta } = review;
  const tone = agreed || delta === 0 ? "neutral" : delta > 0 ? "cost" : "beat";

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-text-muted">
        Your GW{review.event} armband, reviewed
      </h2>

      <p
        className={`mt-1.5 text-md font-semibold ${
          tone === "cost" ? "text-danger" : tone === "beat" ? "text-success" : "text-text-primary"
        }`}
      >
        {review.verdict}
      </p>

      <p className="mt-1 text-sm leading-snug text-text-secondary">
        You captained{" "}
        <span className="font-semibold text-text-primary">{review.your_pick}</span> ({review.your_points}{" "}
        pts). We said{" "}
        <span className="font-semibold text-text-primary">{review.model_pick}</span> ({review.model_points}{" "}
        pts)
        {review.multiplier > 2 ? `, and you tripled it` : ""}.
      </p>

      <p className="mt-2 text-xs leading-snug text-text-muted">
        Compared against the projection committed to the repository before that deadline, ranked
        within your own squad - not the whole game.{" "}
        <Link href="/accuracy" className="font-semibold text-text-secondary hover:underline">
          The full record →
        </Link>
      </p>
    </section>
  );
}
