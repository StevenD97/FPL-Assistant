"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet } from "@/shared/lib/api";
import { Button } from "@/shared/ui/Button";
import { TextField } from "@/shared/ui/TextField";
import {
  type TeamEntry,
  clearStoredTeamId,
  loadStoredTeamId,
  loadTrackedTeamIds,
  parseTeamId,
  storeTeamId,
  storeTrackedTeamIds,
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
  const [trackedTeamIds, setTrackedTeamIds] = useState<number[]>([]);

  // Restore tracked teams on load.
  useEffect(() => {
    setTrackedTeamIds(loadTrackedTeamIds());
  }, []);

  const trackTeam = useCallback(
    (input: string): boolean => {
      const id = parseTeamId(input);
      if (id == null) return false;
      let added = false;
      setTrackedTeamIds((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        storeTrackedTeamIds(next);
        added = true;
        return next;
      });
      return added || trackedTeamIds.includes(id);
    },
    [trackedTeamIds],
  );

  const untrackTeam = useCallback((id: number) => {
    setTrackedTeamIds((prev) => {
      const next = prev.filter((n) => n !== id);
      storeTrackedTeamIds(next);
      return next;
    });
  }, []);

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
  useEffect(() => {
    const id = loadStoredTeamId();
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

  useEffect(() => {
    if (open) setInput("");
  }, [open]);

  if (!open) return null;
  const submitting = status === "loading";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="animate-fpl-fade absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="animate-fpl-fade relative w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h2 className="text-md font-bold text-pl-purple">Connect your team</h2>
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
