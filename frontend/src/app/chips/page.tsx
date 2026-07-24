"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { fetchJson } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type ChipRow = {
  event: number;
  squad_total_score: number;
  bench_score: number;
  best_captain_score: number;
  best_captain_name: string;
  blank_count: number;
  double_count: number;
};

type ChipResponse = {
  scan_start_event: number;
  scan_end_event: number;
  table: ChipRow[];
  bench_boost: { event: number; bench_score: number; double_count: number };
  triple_captain: { event: number; player: string; score: number };
  free_hit: { recommended: boolean; event: number; blank_count: number };
  wildcard: { reason: string; suggested_event: number } | null;
};

export default function ChipsPage() {
  const [teamId, setTeamId] = useState("");
  const [data, setData] = useState<ChipResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
    try {
      setData(await fetchJson(`${API_URL}/api/squad/${teamId}/chips`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="px-4 py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 font-sans text-lg font-bold tracking-tight text-pl-purple">
          Chip strategy
        </h1>
        <p className="mb-6 text-sm text-text-secondary">
          Enter your team ID to scan for chip timing (demo window: GW24-36, 2025/26).
        </p>
        <form onSubmit={handleSubmit} className="mb-6 flex items-end gap-3">
          <TextField
            label="Team ID"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            placeholder="e.g. 1178869"
          />
          <Button type="submit" disabled={loading || !teamId}>
            {loading ? "Scanning..." : "Scan chips"}
          </Button>
        </form>

        {error && (
          <p className="mb-4 text-sm font-medium text-danger">{error}</p>
        )}

        {data && (
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <p className="text-sm text-text-muted">Bench Boost</p>
                <p className="text-lg font-semibold text-text-primary">
                  GW{data.bench_boost.event}
                </p>
                <p className="text-sm text-text-secondary">
                  bench score <span className="font-mono">{data.bench_boost.bench_score.toFixed(3)}</span>,{" "}
                  {data.bench_boost.double_count} doubles
                </p>
              </Card>
              <Card>
                <p className="text-sm text-text-muted">Triple Captain</p>
                <p className="text-lg font-semibold text-text-primary">
                  GW{data.triple_captain.event} - {data.triple_captain.player}
                </p>
                <p className="text-sm text-text-secondary">
                  score <span className="font-mono">{data.triple_captain.score.toFixed(3)}</span>
                </p>
              </Card>
              <Card>
                <p className="text-sm text-text-muted">Free Hit</p>
                {data.free_hit.recommended ? (
                  <>
                    <p className="text-lg font-semibold text-text-primary">
                      GW{data.free_hit.event}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {data.free_hit.blank_count} of your 15 blank
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-text-secondary">
                    No strong case in this window - hold the chip
                  </p>
                )}
              </Card>
              <Card>
                <p className="text-sm text-text-muted">Wildcard</p>
                {data.wildcard ? (
                  <>
                    <p className="text-lg font-semibold text-text-primary">
                      Around GW{data.wildcard.suggested_event}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {data.wildcard.reason}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-text-secondary">
                    No major cluster found
                  </p>
                )}
              </Card>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-sunken">
                  <tr>
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">GW</th>
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Squad score</th>
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Bench score</th>
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Best captain</th>
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Blanks</th>
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Doubles</th>
                  </tr>
                </thead>
                <tbody>
                  {data.table.map((row) => (
                    <tr key={row.event} className="border-t border-border">
                      <td className="px-3 py-2.5 font-medium">GW{row.event}</td>
                      <td className="px-3 py-2.5 font-mono">{row.squad_total_score}</td>
                      <td className="px-3 py-2.5 font-mono">{row.bench_score}</td>
                      <td className="px-3 py-2.5">
                        {row.best_captain_name} (<span className="font-mono">{row.best_captain_score}</span>)
                      </td>
                      <td className="px-3 py-2.5 font-mono">{row.blank_count}</td>
                      <td className="px-3 py-2.5 font-mono">{row.double_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
