import { useEffect, useState } from "react";

/**
 * Polls /api/health for server-side status (AWS wiring, window size).
 * Returns undefined while the first check is in flight, null if the API is unreachable.
 */
export function useHealth(intervalMs = 10000) {
  const [health, setHealth] = useState(undefined);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/health")
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((h) => alive && setHealth(h))
        .catch(() => alive && setHealth(null));
    load();
    const t = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(t); };
  }, [intervalMs]);
  return health;
}
