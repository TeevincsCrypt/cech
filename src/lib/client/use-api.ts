"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal data hook with optional polling. Polling pauses while the tab is
 * hidden and can be turned off once data reaches a terminal state.
 */
export function useApi<T>(url: string | null, opts: { pollMs?: number | ((data: T | null) => number | null) } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dataRef = useRef<T | null>(null);
  const pollRef = useRef(opts.pollMs);
  useEffect(() => {
    pollRef.current = opts.pollMs;
  });

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      dataRef.current = body as T;
      setData(body as T);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState === "visible") await load();
      if (cancelled) return;
      const p = pollRef.current;
      const ms = typeof p === "function" ? p(dataRef.current) : p;
      if (ms) timer = setTimeout(tick, ms);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  return { data, error, loading, reload: load };
}
