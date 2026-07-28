"use client";

import { useCallback, useState } from "react";

export type AsyncResource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

/**
 * One request's data/loading/error, which the squad panels were each spelling
 * out by hand. LoadTeamPanel alone had five copies of the same three useStates
 * and the same try/catch/finally - 15 state variables where the only real
 * difference between them was the fallback error message.
 *
 * `run` resolves to the fetched value (or null if it threw) so a caller can
 * chain follow-up work on success without re-reading state that hasn't
 * committed yet - which is how the squad load kicks off the optimizer, planner
 * and chip scan.
 */
export function useAsyncResource<T>(fallbackMessage = "Something went wrong") {
  const [state, setState] = useState<AsyncResource<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const run = useCallback(
    async (fetcher: () => Promise<T>): Promise<T | null> => {
      setState({ data: null, loading: true, error: null });
      try {
        const data = await fetcher();
        setState({ data, loading: false, error: null });
        return data;
      } catch (err) {
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : fallbackMessage,
        });
        return null;
      }
    },
    [fallbackMessage],
  );

  const reset = useCallback(
    () => setState({ data: null, loading: false, error: null }),
    [],
  );

  /** For the one caller that treats a failure as "no results" rather than an error. */
  const set = useCallback(
    (data: T | null) => setState({ data, loading: false, error: null }),
    [],
  );

  return { ...state, run, reset, set };
}
