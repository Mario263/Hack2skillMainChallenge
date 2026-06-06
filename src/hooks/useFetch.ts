"use client";

import { useEffect, useState } from "react";
import { apiFetch, HttpError } from "@/lib/api-client";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: HttpError | null;
}

/**
 * Client data fetcher for the app's `{ data: T }` JSON envelope.
 *
 * Centralizes the fetch-on-deps pattern used across dashboard panels:
 * abort-safe cleanup (no setState after unmount), a loading flag, and a typed
 * error instead of silently swallowing failures. Re-fetches whenever `url` or
 * any value in `deps` changes.
 */
export function useFetch<T>(
  url: string | null,
  deps: React.DependencyList = [],
): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: url != null,
    error: null,
  });

  useEffect(() => {
    if (url == null) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));

    apiFetch<{ data: T }>(url)
      .then((res) => {
        if (active) setState({ data: res.data, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (!active) return;
        const error =
          e instanceof HttpError ? e : new HttpError(0, "Network error", "network");
        setState((s) => ({ ...s, loading: false, error }));
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  return state;
}
