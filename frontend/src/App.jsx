import { useMemo, useState } from "react";
import { useLiveFeed } from "./hooks/useLiveFeed.js";
import { useHealth } from "./hooks/useHealth.js";
import ErrorRateChart from "./components/ErrorRateChart.jsx";
import AlertFeed from "./components/AlertFeed.jsx";
import IncidentPanel from "./components/IncidentPanel.jsx";
import { Logo, IconActivity, IconCloud, IconFile, IconGauge, IconGithub, IconSend, IconZap } from "./components/Icons.jsx";
import { clock, ms, pct, sevLabel, sevRank } from "./format.js";

const CONN = {
  live: { label: "Live", cls: "ok" },
  poll: { label: "Polling", cls: "warn" },
  connecting: { label: "Reconnecting", cls: "off" },
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

function Kpi({ icon, label, value, sub, tone }) {
  return (
    <div className={`card kpi${tone ? " " + tone : ""}`}>
      <div className="kpi-label">{icon}{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

export default function App() {
  const { metrics, alerts, conn } = useLiveFeed();
  const health = useHealth();
  const [acked, setAcked] = useState(() => new Set());
  const last = metrics[metrics.length - 1];
  const now = last?.timestamp ?? Date.now() / 1000;

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
  const state = open
    ? {
        cls: open.peak.toLowerCase(),
        title: `${sevLabel(open.peak)} incident in progress`,
        text: `Error rate is ${pct(last?.error_rate)} against a normal ${pct(last?.baseline)}. ${open.alerts.length} alert${open.alerts.length > 1 ? "s" : ""} since ${clock(open.start)}.`,
      }
    : warming
      ? { cls: "learning", title: "Learning normal behaviour", text: "Collecting the first window of traffic to establish a baseline." }
      : { cls: "ok", title: "All systems normal", text: `Error rate ${pct(last.error_rate)} is within its learned range (baseline ${pct(last.baseline)}).` };
  const c = CONN[conn];
  const logName = health?.log_path?.split(/[\\/]/).pop();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span className="brand-name">Log-Seismo</span>
          <span className="brand-tag">Anomaly detection</span>
        </div>
        <div className="top-meta">
          {logName && <span className="pill"><IconFile />{logName}</span>}
          {health && <span className="pill"><IconActivity />{health.window_sec}s window</span>}
          {health && (
            <span className={`pill ${health.aws_enabled ? "ok" : "off"}`} title={health.aws_enabled ? `${health.aws_sent} sent to AWS` : "Set AWS_ENABLED=true to publish"}>
              <IconCloud />{health.aws_enabled ? `CloudWatch${health.sns_enabled ? " + SNS" : ""}` : "AWS off"}
            </span>
          )}
          <span className={`pill status ${c.cls}`}><i className="pulse" />{c.label}</span>
        </div>
      </header>

      <main className="content">
        <section className={`hero ${state.cls}`} role="status" aria-live="polite">
          <div className="hero-dot" />
          <div className="hero-text">
            <h1>{state.title}</h1>
            <p>{state.text}</p>
          </div>
        </section>

        <div className="kpis">
          <Kpi icon={<IconActivity />} label="Error rate" value={pct(last?.error_rate)}
               sub={last ? `${last.errors} errors in ${last.total} lines` : "waiting for logs"}
               tone={open ? open.peak.toLowerCase() : undefined} />
          <Kpi icon={<IconGauge />} label="Baseline" value={warming ? "Learning" : pct(last.baseline)}
               sub={warming ? "first window in progress" : `alert above ${pct(last.upper_band)}`} />
          <Kpi icon={<IconZap />} label="Detection lag" value={ms(stats.lag)} sub="error written → alert raised" />
          <Kpi icon={<IconSend />} label="Delivery" value={ms(stats.delivery)}
               sub={stats.delivery == null ? "measured on the next live alert" : "alert raised → on screen"} />
        </div>

        <div className="grid-main">
          <ErrorRateChart metrics={metrics} alerts={alerts} />
          <IncidentPanel incidents={incidents} now={now} />
        </div>

        <AlertFeed alerts={alerts} acked={acked} onAck={(id) => setAcked((p) => new Set(p).add(id))} />
      </main>

      <footer className="footer">
        <span>Log-Seismo · sliding-window z-score detector with adaptive baseline</span>
        <a href="https://github.com/gershomrichardbruno/Log-Seismo" target="_blank" rel="noreferrer"><IconGithub />Source</a>
      </footer>
    </div>
  );
}
