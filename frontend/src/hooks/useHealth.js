import { useEffect, useState } from "react";

/** Polls /api/health for server-side status (AWS wiring, window size). */
export function useHealth(intervalMs = 10000) {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then((h) => alive && setHealth(h))
        .catch(() => alive && setHealth(null));
    load();
    const t = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(t); };
  }, [intervalMs]);
  return health;
}
