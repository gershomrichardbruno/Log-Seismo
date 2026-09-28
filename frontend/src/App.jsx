import { useMemo, useState } from "react";
import { useLiveFeed } from "./hooks/useLiveFeed.js";
import { useHealth } from "./hooks/useHealth.js";
import ErrorRateChart from "./components/ErrorRateChart.jsx";
import AlertFeed from "./components/AlertFeed.jsx";
import IncidentPanel from "./components/IncidentPanel.jsx";
import { clock, ms, pct, sevLabel, sevRank } from "./format.js";

const CONNECTION = {
  live: "Live stream",
  poll: "REST fallback",
  connecting: "Reconnecting",
};

/** Group alerts (newest first) into incidents, newest incident first. */
function buildIncidents(alerts) {
  const byId = new Map();
  for (const a of alerts.slice().reverse()) {
    if (!a.incident_id) continue;
    let inc = byId.get(a.incident_id);
    if (!inc) byId.set(a.incident_id, (inc = { id: a.incident_id, alerts: [], start: a.timestamp, peak: a.severity, resolved: false }));
    if (a.kind === "recovery") { inc.resolved = true; inc.end = a.timestamp; continue; }
    inc.alerts.push(a);
    inc.latest = a;
    if (sevRank(a.severity) > sevRank(inc.peak)) inc.peak = a.severity;
  }
  return [...byId.values()].filter((i) => i.latest).reverse();
}

function Metric({ label, value, detail, accent = "" }) {
  return (
    <div className={`metric ${accent}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-detail">{detail}</span>
    </div>
  );
}

export default function App() {
  const { metrics, alerts, conn } = useLiveFeed();
  const health = useHealth();
  const [acked, setAcked] = useState(() => new Set());
  const last = metrics[metrics.length - 1];
  const now = last?.timestamp ?? Date.now() / 1000;
  const windowSec = health?.window_sec ?? 60;

  const incidents = useMemo(() => buildIncidents(alerts), [alerts]);
  const open = incidents.find((i) => !i.resolved);
  const stats = useMemo(() => {
    const anomalies = alerts.filter((a) => a.kind !== "recovery");
    const lags = anomalies.map((a) => a.detection_lag_ms).filter((x) => x != null);
    const deliveries = anomalies.filter((a) => a.receivedAt).map((a) => (a.receivedAt - a.timestamp) * 1000);
    const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
    return { lag: avg(lags), delivery: avg(deliveries) };
  }, [alerts]);

  const warming = !last || last.warming_up;
  const status = open
    ? {
        cls: open.peak.toLowerCase(),
        title: `${sevLabel(open.peak)} incident in progress`,
        text: `Error rate ${pct(last?.error_rate)} against a normal ${pct(last?.baseline)} · ${open.alerts.length} alert${open.alerts.length > 1 ? "s" : ""} since ${clock(open.start)}`,
      }
    : warming
      ? { cls: "learning", title: "Learning normal behaviour", text: "Collecting the first window of traffic to establish a baseline." }
      : { cls: "ok", title: "All quiet", text: `Error rate ${pct(last.error_rate)} is within its learned range (baseline ${pct(last.baseline)}).` };

  const apiState = health === undefined ? "checking" : health ? "healthy" : "unavailable";
  const awsLabel = !health ? "–" : health.aws_enabled ? `CloudWatch${health.sns_enabled ? " + SNS" : ""}` : "Off";

  return (
    <main className="console-shell">
      <header className="masthead">
        <a className="brand" href="/" aria-label="Log-Seismo monitor home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-name">LOG<span>·</span>SEISMO</span>
        </a>
        <div className="masthead-meta">
          <span className={`connection connection-${conn}`} role="status">
            <i className="status-light" />{CONNECTION[conn]}
          </span>
          <span className={`api-health api-${apiState}`}>
            <span>API</span> {apiState === "healthy" ? "Healthy" : apiState === "checking" ? "Checking" : "Unavailable"}
          </span>
          <span className={`aws-state ${health?.aws_enabled ? "aws-on" : ""}`}
                title={health?.aws_enabled ? `${health.aws_sent} alerts sent to AWS` : "Set AWS_ENABLED=true in .env to publish"}>
            <span>AWS</span> {awsLabel}
          </span>
          <span className="updated-at">{last ? `Updated ${clock(last.timestamp)}` : "No signal yet"}</span>
        </div>
      </header>

      <section className="console-intro" aria-label="Detector overview">
        <div>
          <p className="eyebrow intro-eyebrow">Operations / Live monitor</p>
          <h1>Incident recorder</h1>
        </div>
        <p className="intro-note">
          Watching <code>{health?.log_path?.split(/[\\/]/).pop() ?? "the application log"}</code> for departures from its learned error baseline.
        </p>
      </section>

      <section className={`status-line status-${status.cls}`} role="status" aria-live="polite">
        <i className="status-mark" />
        <strong>{status.title}</strong>
        <span>{status.text}</span>
      </section>

      <section className="metrics-strip" aria-label="Current detector metrics">
        <Metric label="Error rate" value={pct(last?.error_rate)}
                detail={last ? `rolling ${windowSec} sec` : "Awaiting first sample"}
                accent={open ? `metric-${open.peak.toLowerCase()}` : "metric-primary"} />
        <Metric label="Baseline" value={warming ? "Learning" : pct(last.baseline)}
                detail={warming ? "Collecting normal behaviour" : `alert above ${pct(last.upper_band)}`} />
        <Metric label="Detector state" value={warming ? "Warm-up" : open ? "Incident" : "Monitoring"}
                detail={warming ? "Baseline not established" : open ? `#${open.id.slice(0, 8)} open` : "Baseline established"}
                accent={warming ? "metric-warming" : open ? `metric-${open.peak.toLowerCase()}` : "metric-ready"} />
        <Metric label="Window volume" value={last ? `${last.total.toLocaleString()} lines` : "--"}
                detail={last ? `${last.errors.toLocaleString()} errors / ${windowSec} sec` : "No window data"} />
        <Metric label="Detection lag" value={ms(stats.lag)} detail="error written → alert raised" />
        <Metric label="Delivery" value={ms(stats.delivery)}
                detail={stats.delivery == null ? "measured on the next live alert" : "alert raised → on screen"} />
      </section>

      <div className="grid-main">
        <ErrorRateChart metrics={metrics} alerts={alerts} windowSec={windowSec} connecting={conn === "connecting"} />
        <IncidentPanel incidents={incidents} now={now} />
      </div>

      <AlertFeed alerts={alerts} acked={acked} onAck={(id) => setAcked((p) => new Set(p).add(id))}
                 offline={conn === "connecting" && apiState === "unavailable"} />

      <footer className="console-footer">
        <span>LOG-SEISMO / DETECTOR CONSOLE</span>
        <a href="https://github.com/gershomrichardbruno/Log-Seismo" target="_blank" rel="noreferrer">SOURCE ON GITHUB</a>
      </footer>
    </main>
  );
}
