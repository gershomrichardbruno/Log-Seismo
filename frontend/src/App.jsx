import { useMemo, useState } from "react";
import { useLiveFeed } from "./hooks/useLiveFeed.js";
import ErrorRateChart from "./components/ErrorRateChart.jsx";
import AlertFeed from "./components/AlertFeed.jsx";
import { ms, pct, sevLabel } from "./format.js";

const CONN_LABEL = { live: "Live (WebSocket)", poll: "Polling", connecting: "Reconnecting" };

export default function App() {
  const { metrics, alerts, conn, spanSec } = useLiveFeed();
  const [filter, setFilter] = useState({ minSeverity: "LOW", showRecovery: true });
  const [acked, setAcked] = useState(() => new Set());
  const last = metrics[metrics.length - 1];

  const stats = useMemo(() => {
    const anomalies = alerts.filter((a) => a.kind !== "recovery");
    const lags = anomalies.map((a) => a.detection_lag_ms).filter((x) => x != null);
    const deliveries = anomalies.filter((a) => a.receivedAt).map((a) => (a.receivedAt - a.timestamp) * 1000);
    const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
    // An incident is open if its latest alert is not a recovery.
    const latestByIncident = new Map();
    for (const a of alerts) if (a.incident_id && !latestByIncident.has(a.incident_id)) latestByIncident.set(a.incident_id, a);
    const open = [...latestByIncident.values()].find((a) => a.kind !== "recovery");
    return { count: anomalies.length, lag: avg(lags), delivery: avg(deliveries), open };
  }, [alerts]);

  const onAck = (id) => setAcked((prev) => new Set(prev).add(id));

  return (
    <main>
      <header>
        <h1>Log-Seismo <span className="sub">real-time log anomaly detector</span></h1>
        <div className="status">
          <span><span className={`dot ${conn}`} />{CONN_LABEL[conn]}</span>
          <span>Error rate <strong>{pct(last?.error_rate)}</strong></span>
          <span>Baseline <strong>{!last || last.warming_up ? "learning" : pct(last.baseline)}</strong></span>
        </div>
      </header>

      <div className={`banner ${stats.open ? "incident" : "ok"}`} role="status"
           style={stats.open ? { "--c": `var(--${stats.open.severity.toLowerCase()})` } : undefined}>
        {stats.open
          ? <><strong>{sevLabel(stats.open.severity)} incident in progress.</strong> {stats.open.message}</>
          : last?.warming_up || !last
            ? "Learning normal behaviour from the log stream…"
            : "All normal. Error rate is within its learned range."}
      </div>

      <ErrorRateChart metrics={metrics} alerts={alerts} spanSec={spanSec} />

      <dl className="tiles">
        <div><dt>Anomalies</dt><dd>{stats.count}</dd></div>
        <div><dt>Avg detection lag</dt><dd>{ms(stats.lag)}</dd><small>error line written → alert raised</small></div>
        <div><dt>Avg delivery</dt><dd>{ms(stats.delivery)}</dd><small>alert raised → on this screen{stats.delivery == null ? " (next live alert)" : ""}</small></div>
        <div><dt>Events in window</dt><dd>{last ? `${last.errors} / ${last.total}` : "–"}</dd><small>errors / lines</small></div>
      </dl>

      <AlertFeed alerts={alerts} filter={filter} setFilter={setFilter} acked={acked} onAck={onAck} />
    </main>
  );
}
