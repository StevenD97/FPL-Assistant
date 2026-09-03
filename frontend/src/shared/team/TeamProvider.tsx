"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet } from "@/shared/lib/api";
import { Button } from "@/shared/ui/Button";
import { TextField } from "@/shared/ui/TextField";
import {
  type TeamEntry,
  clearStoredTeamId,
  loadStoredTeamId,
  parseTeamId,
  storeTeamId,
  storeTrackedTeamIds,
  storeTrackedTeamName,
  useTrackedTeamIds,
  useTrackedTeamNames,
} from "@/shared/lib/team";

type Status = "idle" | "loading" | "ready" | "error";

type TeamContextValue = {
  teamId: number | null;
  entry: TeamEntry | null;
  status: Status;
  error: string | null;
  connect: (input: string) => Promise<boolean>;
  disconnect: () => void;
  promptConnect: () => void;
  trackedTeamIds: number[];
  trackTeam: (input: string) => boolean;
  untrackTeam: (id: number) => void;
  /**
   * Real names for tracked teams, keyed by id as a string. Populated from a
   * device cache immediately and topped up from the API for ids we haven't seen,
   * so a chip can say "Bruno's XI" rather than "Team 1178869".
   */
  trackedTeamNames: Record<string, string>;
};

const TeamContext = createContext<TeamContextValue | null>(null);

export function useTeam(): TeamContextValue {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within <TeamProvider>");
  return ctx;
}

export function TeamProvider({ children }: { children: React.ReactNode }) {
  const [teamId, setTeamId] = useState<number | null>(null);
  const [entry, setEntry] = useState<TeamEntry | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Read from the store rather than mirrored into provider state. The mount
  // effect that used to seed these rendered once with empty lists and again
  // with the stored ones, and any other reader of the same keys could disagree
  // in between. See useTrackedTeamIds in shared/lib/team.
  const trackedTeamIds = useTrackedTeamIds();
  const trackedTeamNames = useTrackedTeamNames();

  // Learn the names we don't have yet, one request per unknown id, and cache
  // them on the device so this only ever happens once per tracked team.
  //
  // The cache is read first (above) so chips render named on a repeat visit
  // without waiting for anything; this only fills gaps. Failures are ignored on
  // purpose - a tracked id that can't be resolved still renders, just as
  // "Team 1178869", which is what it did before.
  useEffect(() => {
    const unknown = trackedTeamIds.filter((id) => !trackedTeamNames[String(id)]);
    if (unknown.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const id of unknown) {
        try {
          const data = await apiGet<TeamEntry>(`/api/entry/${id}`);
          const name = data.team_name?.trim();
          if (!name || cancelled) continue;
          // The store notifies every reader, so there is nothing to mirror.
          storeTrackedTeamName(id, name);
        } catch {
          // Ignore - see above.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // trackedTeamNames is intentionally omitted: it's written by this effect, so
    // depending on it would re-run the loop on every name learned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedTeamIds]);

  const trackTeam = useCallback(
    (input: string): boolean => {
      const id = parseTeamId(input);
      if (id == null) return false;
      if (trackedTeamIds.includes(id)) return true;
      storeTrackedTeamIds([...trackedTeamIds, id]);
      return true;
    },
    [trackedTeamIds],
  );

  const untrackTeam = useCallback((id: number) => {
    storeTrackedTeamIds(trackedTeamIds.filter((n) => n !== id));
  }, [trackedTeamIds]);

  const fetchEntry = useCallback(async (id: number): Promise<boolean> => {
    setStatus("loading");
    setError(null);
    try {
      const data = await apiGet<TeamEntry>(`/api/entry/${id}`);
      setEntry(data);
      setTeamId(id);
      setStatus("ready");
      return true;
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Couldn't reach the server");
      return false;
    }
  }, []);

  // Restore a previously-connected team on load.
  //
  // This is the one set-state-in-effect the codebase keeps, and it is kept on
  // purpose. Fetching on mount is the sanctioned use of an effect - the rule's
  // own text describes it as subscribing to an external system - and the only
  // thing it objects to is that fetchEntry flips status to "loading"
  // synchronously before the first await. Deferring that flip would show an
  // idle, disconnected header for a frame on every page load, which is the
  // exact flash the rest of this pass removed. The other eight cases were
  // genuinely derived state or storage reads and have been restructured; this
  // one is a network call, and there is nowhere better for it to live.
  useEffect(() => {
    const id = loadStoredTeamId();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id != null) fetchEntry(id);
  }, [fetchEntry]);

  const connect = useCallback(
    async (input: string): Promise<boolean> => {
      const id = parseTeamId(input);
      if (id == null) {
        setStatus("error");
        setError("Enter a numeric team ID or your FPL team URL.");
        return false;
      }
      const ok = await fetchEntry(id);
      if (ok) {
        storeTeamId(id);
        setDialogOpen(false);
      }
      return ok;
    },
    [fetchEntry],
  );

  const disconnect = useCallback(() => {
    clearStoredTeamId();
    setTeamId(null);
    setEntry(null);
    setStatus("idle");
    setError(null);
  }, []);

  const promptConnect = useCallback(() => {
    setError(null);
    setStatus((s) => (s === "error" ? "idle" : s));
    setDialogOpen(true);
  }, []);

  return (
    <TeamContext.Provider
      value={{
        teamId,
        entry,
        status,
        error,
        connect,
        disconnect,
        promptConnect,
        trackedTeamIds,
        trackTeam,
        untrackTeam,
        trackedTeamNames,
      }}
    >
      {children}
      <ConnectTeamDialog
        open={dialogOpen}
        status={status}
        error={error}
        onConnect={connect}
        onClose={() => setDialogOpen(false)}
      />
    </TeamContext.Provider>
  );
}

function ConnectTeamDialog({
  open,
  status,
  error,
  onConnect,
  onClose,
}: {
  open: boolean;
  status: Status;
  error: string | null;
  onConnect: (input: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");

  // Cleared when the dialog opens, during render - an effect would show the
  // previous attempt's text for one frame before wiping it.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setInput("");
  }

  if (!open) return null;
  const submitting = status === "loading";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="animate-fpl-fade absolute inset-0 bg-ink-900/50" onClick={onClose} aria-hidden="true" />
      <div className="animate-fpl-fade relative w-full max-w-md rounded-lg bg-surface p-6 shadow-lg">
        <h2 className="text-md font-bold text-text-primary">Connect your team</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Paste your FPL team URL or ID. It&apos;s saved on this device only — no login or password.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onConnect(input);
          }}
          className="mt-4 flex flex-col gap-3"
        >
          <TextField
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="…/entry/1234567/… or 1234567"
          />
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            <Button type="submit" variant="accent" disabled={submitting || !input.trim()}>
              {submitting ? "Connecting…" : "Connect"}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-text-muted">
            Find your ID in the URL when viewing your team on the official FPL site.
          </p>
        </form>
      </div>
    </div>
  );
}
