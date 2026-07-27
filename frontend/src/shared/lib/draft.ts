// Auto-saved squad draft (the manual "Build a draft" workspace). Persisted to
// this device so a half-built squad survives a reload or navigating away -
// same localStorage approach as tracked teams/leagues (see team.ts). Connected
// team + tracked teams/leagues are already persisted by TeamProvider; this
// covers the one thing a user actively *builds*.
const SQUAD_DRAFT_KEY = "xfpl:squad-draft";

export type SquadDraft = { ids: number[]; budget: number };

const DEFAULT_DRAFT: SquadDraft = { ids: [], budget: 100 };

export function loadSquadDraft(): SquadDraft {
  if (typeof window === "undefined") return DEFAULT_DRAFT;
  try {
    const v = window.localStorage.getItem(SQUAD_DRAFT_KEY);
    if (!v) return DEFAULT_DRAFT;
    const parsed = JSON.parse(v);
    const ids = Array.isArray(parsed?.ids) ? parsed.ids.filter((n: unknown) => Number.isInteger(n)) : [];
    const budget = typeof parsed?.budget === "number" ? parsed.budget : DEFAULT_DRAFT.budget;
    return { ids, budget };
  } catch {
    return DEFAULT_DRAFT;
  }
}

export function storeSquadDraft(draft: SquadDraft): void {
  try {
    window.localStorage.setItem(SQUAD_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore (private mode / storage disabled) - the build still works per-session.
  }
}
