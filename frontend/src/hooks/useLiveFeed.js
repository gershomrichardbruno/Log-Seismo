import { useEffect, useRef, useState } from "react";

const SPAN_SEC = 300; // keep 5 minutes of metrics for the chart
const MAX_ALERTS = 200;
const POLL_MS = 2000;
const RECONNECT_MS = 3000;

/**
 * Streams metrics and alerts from the backend.
 * WebSocket first; if it drops, falls back to REST polling while it keeps retrying the socket.
 * Each alert gets `receivedAt` (browser clock) so the UI can show end-to-end delivery latency.
 */
export function useLiveFeed() {
  const [metrics, setMetrics] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [conn, setConn] = useState("connecting"); // live | poll | connecting
  const seen = useRef(new Set());
  const latest = useRef({ metricTs: 0, alertTs: 0 });

  useEffect(() => {
    let ws, pollTimer, retryTimer, closed = false;

    const addMetrics = (ms) => {
      if (!ms.length) return;
      latest.current.metricTs = ms[ms.length - 1].timestamp;
      setMetrics((prev) => {
        const next = prev.concat(ms);
        const cutoff = next[next.length - 1].timestamp - SPAN_SEC;
        let i = 0;
        while (i < next.length && next[i].timestamp < cutoff) i++;
        return i ? next.slice(i) : next;
      });
    };

    const addAlerts = (as, fresh) => {
      const now = Date.now() / 1000;
      const add = [];
      for (const a of as) {
        if (seen.current.has(a.id)) continue;
        seen.current.add(a.id);
        add.push({ ...a, fresh, receivedAt: fresh ? now : null });
        latest.current.alertTs = Math.max(latest.current.alertTs, a.timestamp);
      }
      if (add.length) setAlerts((prev) => add.reverse().concat(prev).slice(0, MAX_ALERTS));
    };

    const poll = async () => {
      try {
        const [ms, as] = await Promise.all([
          fetch(`/api/metrics?since=${latest.current.metricTs}`).then((r) => r.json()),
          fetch(`/api/alerts?since=${latest.current.alertTs}`).then((r) => r.json()),
        ]);
        addMetrics(ms);
        addAlerts(as, true);
        setConn("poll");
      } catch {
        /* server down; keep trying */
      }
    };

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
      ws.onopen = () => {
        setConn("live");
        clearInterval(pollTimer);
        pollTimer = null;
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "snapshot") {
          setMetrics([]);
          addMetrics(msg.data.metrics);
          addAlerts(msg.data.alerts, false);
        } else if (msg.type === "metric") addMetrics([msg.data]);
        else if (msg.type === "alert") addAlerts([msg.data], true);
      };
      ws.onclose = () => {
        if (closed) return;
        if (!pollTimer) {
          setConn("connecting");
          pollTimer = setInterval(poll, POLL_MS);
        }
        retryTimer = setTimeout(connect, RECONNECT_MS);
      };
    };

    connect();
    return () => {
      closed = true;
      clearInterval(pollTimer);
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  return { metrics, alerts, conn, spanSec: SPAN_SEC };
}
