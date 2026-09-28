import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const HISTORY_SECONDS = 300;
const MAX_ALERTS = 200;

const formatPercent = (value) =>
  Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "--";

const formatClock = (timestamp) =>
  new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const severityLabel = (severity) =>
  severity ? severity.charAt(0) + severity.slice(1).toLowerCase() : "Unknown";

async function getJson(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function useMonitor() {
  const [metrics, setMetrics] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [connection, setConnection] = useState("connecting");
  const [health, setHealth] = useState("checking");
  const [receivedSnapshot, setReceivedSnapshot] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const metricsRef = useRef([]);
  const alertsRef = useRef([]);

  useEffect(() => {
    let socket;
    let reconnectTimer;
    let pollTimer;
    let healthTimer;
    let disposed = false;

    const acceptMetric = (metric) => {
      metricsRef.current = [...metricsRef.current, metric].sort(
        (left, right) => left.timestamp - right.timestamp,
      );
      const cutoff = metric.timestamp - HISTORY_SECONDS;
      metricsRef.current = metricsRef.current.filter((item) => item.timestamp >= cutoff);
      setMetrics(metricsRef.current);
      setLastUpdated(metric.timestamp);
    };

    const acceptAlert = (alert) => {
      if (alertsRef.current.some((item) => item.id === alert.id)) return;
      alertsRef.current = [alert, ...alertsRef.current]
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, MAX_ALERTS);
      setAlerts(alertsRef.current);
    };

    const refreshHealth = async () => {
      try {
        const result = await getJson("/api/health");
        if (!disposed) setHealth(result.status === "ok" ? "healthy" : "degraded");
      } catch {
        if (!disposed) setHealth("unavailable");
      }
    };

    const poll = async () => {
      try {
        const metricSince = metricsRef.current.at(-1)?.timestamp ?? 0;
        const alertSince = alertsRef.current[0]?.timestamp ?? 0;
        const [newMetrics, newAlerts] = await Promise.all([
          getJson(`/api/metrics?since=${metricSince}`),
          getJson(`/api/alerts?since=${alertSince}`),
        ]);
        newMetrics.forEach(acceptMetric);
        newAlerts.forEach(acceptAlert);
        if (!disposed) setReceivedSnapshot(true);
        if (!disposed && socket?.readyState !== WebSocket.OPEN) setConnection("polling");
      } catch {
        if (!disposed && socket?.readyState !== WebSocket.OPEN) setConnection("offline");
      }
    };

    const beginPolling = () => {
      if (pollTimer || disposed) return;
      void poll();
      pollTimer = window.setInterval(poll, 2000);
    };

    const connect = () => {
      if (disposed) return;
      setConnection("connecting");
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${scheme}//${window.location.host}/ws`);

      socket.onopen = () => {
        if (disposed) return;
        setConnection("live");
        if (pollTimer) window.clearInterval(pollTimer);
        pollTimer = undefined;
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "snapshot") {
            const nextMetrics = [...message.data.metrics].sort(
              (left, right) => left.timestamp - right.timestamp,
            );
            metricsRef.current = nextMetrics.slice(-600);
            setMetrics(metricsRef.current);
            alertsRef.current = [...message.data.alerts]
              .sort((left, right) => right.timestamp - left.timestamp)
              .slice(0, MAX_ALERTS);
            setAlerts(alertsRef.current);
            setLastUpdated(metricsRef.current.at(-1)?.timestamp ?? null);
            setReceivedSnapshot(true);
          } else if (message.type === "metric") {
            acceptMetric(message.data);
            setReceivedSnapshot(true);
          } else if (message.type === "alert") {
            acceptAlert(message.data);
          }
        } catch {
          setConnection("offline");
        }
      };

      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (disposed) return;
        beginPolling();
        reconnectTimer = window.setTimeout(connect, 3000);
      };
    };

    void refreshHealth();
    healthTimer = window.setInterval(refreshHealth, 15000);
    connect();

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(pollTimer);
      window.clearInterval(healthTimer);
      socket?.close();
    };
  }, []);

  return { metrics, alerts, connection, health, receivedSnapshot, lastUpdated };
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

function ErrorRateChart({ metrics, alerts, loading, offline }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined;

    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const style = getComputedStyle(document.documentElement);
      const color = (name) => style.getPropertyValue(name).trim();
      const padding = { left: 48, right: 12, top: 14, bottom: 28 };
      const now = metrics.at(-1)?.timestamp ?? Date.now() / 1000;
      const start = now - HISTORY_SECONDS;
      const visible = metrics.filter((metric) => metric.timestamp >= start);
      const peak = Math.max(
        0.1,
        ...visible.map((metric) => Math.max(metric.error_rate ?? 0, metric.upper_band ?? 0)),
      );
      const maxY = Math.ceil((peak * 1.15) / 0.05) * 0.05;
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;
      const x = (timestamp) => padding.left + ((timestamp - start) / HISTORY_SECONDS) * plotWidth;
      const y = (value) => padding.top + plotHeight - (value / maxY) * plotHeight;

      context.font = '11px "IBM Plex Mono", monospace';
      context.fillStyle = color("--muted");
      context.strokeStyle = color("--rule");
      context.lineWidth = 1;
      const step = maxY > 0.5 ? 0.2 : maxY > 0.2 ? 0.1 : 0.05;
      for (let value = 0; value <= maxY + 0.000001; value += step) {
        const yPosition = y(value);
        context.beginPath();
        context.moveTo(padding.left, yPosition + 0.5);
        context.lineTo(width - padding.right, yPosition + 0.5);
        context.stroke();
        context.fillText(`${Math.round(value * 100)}%`, 4, yPosition + 4);
      }

      for (let seconds = 0; seconds <= HISTORY_SECONDS; seconds += 60) {
        const xPosition = x(start + seconds);
        const label = seconds === HISTORY_SECONDS ? "NOW" : `-${(HISTORY_SECONDS - seconds) / 60}m`;
        context.fillText(label, xPosition - (seconds === HISTORY_SECONDS ? 25 : 14), height - 7);
      }

      const learned = visible.filter(
        (metric) => !metric.warming_up && Number.isFinite(metric.baseline) && Number.isFinite(metric.upper_band),
      );
      if (learned.length > 1) {
        context.beginPath();
        learned.forEach((metric, index) => {
          context[index === 0 ? "moveTo" : "lineTo"](x(metric.timestamp), y(metric.upper_band));
        });
        for (let index = learned.length - 1; index >= 0; index -= 1) {
          const metric = learned[index];
          const lowerBand = Math.max(0, 2 * metric.baseline - metric.upper_band);
          context.lineTo(x(metric.timestamp), y(lowerBand));
        }
        context.closePath();
        context.fillStyle = color("--band");
        context.fill();
      }

      const severityColors = {
        LOW: color("--low"),
        MEDIUM: color("--medium"),
        HIGH: color("--high"),
        CRITICAL: color("--critical"),
      };
      for (const alert of alerts) {
        if (alert.timestamp < start || alert.timestamp > now) continue;
        const markerX = Math.round(x(alert.timestamp)) + 0.5;
        context.strokeStyle = severityColors[alert.severity] ?? color("--critical");
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(markerX, padding.top);
        context.lineTo(markerX, height - padding.bottom);
        context.stroke();
        context.fillStyle = context.strokeStyle;
        context.fillRect(markerX - 3, padding.top, 6, 6);
      }

      if (visible.length > 0) {
        context.beginPath();
        visible.forEach((metric, index) => {
          context[index === 0 ? "moveTo" : "lineTo"](x(metric.timestamp), y(metric.error_rate));
        });
        context.strokeStyle = color("--trace");
        context.lineWidth = 2;
        context.lineJoin = "round";
        context.stroke();
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [metrics, alerts]);

  return (
    <section className="plot-section" aria-labelledby="plot-title">
      <div className="section-heading plot-heading">
        <div>
          <p className="eyebrow">Telemetry / 01</p>
          <h2 id="plot-title">Error rate <span>· rolling 60 s window</span></h2>
        </div>
        <span className="plot-range">LAST 05:00</span>
      </div>
      <div className="plot-frame">
        {metrics.length === 0 && (
          <div className="plot-state" role="status">
            {offline ? "Waiting for the detector to reconnect" : loading ? "Connecting to the detector" : "Waiting for the first metric"}
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="rate-chart"
          role="img"
          aria-label="Error rate over the last five minutes, with the normal range and severity markers"
        />
      </div>
      <div className="chart-legend" aria-label="Chart legend">
        <span><i className="legend-line" />Error rate</span>
        <span><i className="legend-band" />Baseline range</span>
        <span><i className="legend-marker" />Incident marker</span>
      </div>
    </section>
  );
}

function AlertItem({ alert }) {
  const severity = alert.severity?.toLowerCase() ?? "critical";
  const samples = Array.isArray(alert.sample_lines) ? alert.sample_lines : [];

  return (
    <li className={`incident incident-${severity}`}>
      <details>
        <summary>
          <span className="incident-severity">{severityLabel(alert.severity)}</span>
          <time className="incident-time" dateTime={alert.timestamp_iso ?? new Date(alert.timestamp * 1000).toISOString()}>
            {formatClock(alert.timestamp)}
          </time>
          <span className="incident-rate">
            <strong>{formatPercent(alert.error_rate)}</strong>
            <span>vs {formatPercent(alert.baseline)} baseline</span>
          </span>
          <span className="incident-volume">{alert.errors} / {alert.total} errors</span>
          <span className="incident-z">z {Number(alert.z_score).toFixed(1)}</span>
          <span className="expand-hint" aria-hidden="true">+</span>
        </summary>
        <div className="incident-details">
          <div className="detail-label">Sample lines <span>{samples.length}</span></div>
          {samples.length ? (
            <pre>{samples.join("\n")}</pre>
          ) : (
            <p className="sample-empty">No sample lines were attached to this incident.</p>
          )}
        </div>
      </details>
    </li>
  );
}

function App() {
  const { metrics, alerts, connection, health, receivedSnapshot, lastUpdated } = useMonitor();
  const latest = metrics.at(-1);
  const warming = !latest || latest.warming_up;
  const eventVolume = latest ? `${latest.total.toLocaleString()} lines` : "--";
  const eventDetail = latest ? `${latest.errors.toLocaleString()} errors / 60 sec` : "No window data";
  const connectionLabels = {
    connecting: "Connecting",
    live: "Live stream",
    polling: "REST fallback",
    offline: "Offline",
  };

  return (
    <main className="console-shell">
      <header className="masthead">
        <a className="brand" href="/" aria-label="Log-Seismo monitor home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-name">LOG<span>·</span>SEISMO</span>
        </a>
        <div className="masthead-meta">
          <span className={`connection connection-${connection}`} role="status">
            <i className="status-light" />{connectionLabels[connection]}
          </span>
          <span className={`api-health api-${health}`}>
            <span>API</span> {health === "healthy" ? "Healthy" : health === "checking" ? "Checking" : health === "degraded" ? "Degraded" : "Unavailable"}
          </span>
          <span className="updated-at">{lastUpdated ? `Updated ${formatClock(lastUpdated)}` : "No signal yet"}</span>
        </div>
      </header>

      <section className="console-intro" aria-label="Detector overview">
        <div>
          <p className="eyebrow intro-eyebrow">Operations / Live monitor</p>
          <h1>Incident recorder</h1>
        </div>
        <p className="intro-note">Watching the application log for departures from its learned error baseline.</p>
      </section>

      <section className="metrics-strip" aria-label="Current detector metrics">
        <Metric
          label="Error rate"
          value={latest ? formatPercent(latest.error_rate) : "--"}
          detail={latest ? "rolling 60 sec" : "Awaiting first sample"}
          accent="metric-primary"
        />
        <Metric
          label="Baseline"
          value={warming ? "Learning" : formatPercent(latest.baseline)}
          detail={warming ? "Collecting normal behavior" : "EWMA · normal periods"}
        />
        <Metric label="Window volume" value={eventVolume} detail={eventDetail} />
        <Metric
          label="Detector state"
          value={warming ? "Warm-up" : "Monitoring"}
          detail={warming ? "Baseline not established" : "Baseline established"}
          accent={warming ? "metric-warming" : "metric-ready"}
        />
      </section>

      <ErrorRateChart metrics={metrics} alerts={alerts} loading={!receivedSnapshot} offline={connection === "offline"} />

      <section className="feed-section" aria-labelledby="feed-title">
        <div className="section-heading feed-heading">
          <div>
            <p className="eyebrow">Response / 02</p>
            <h2 id="feed-title">Incident feed</h2>
          </div>
          <div className="feed-count"><strong>{alerts.length.toString().padStart(2, "0")}</strong><span>recorded</span></div>
        </div>

        {alerts.length > 0 ? (
          <ol className="incident-list">
            {alerts.map((alert) => <AlertItem key={alert.id} alert={alert} />)}
          </ol>
        ) : (
          <div className="feed-state" role="status">
            <span className="feed-state-mark" aria-hidden="true">—</span>
            <div>
              <strong>{connection === "offline" ? "Feed paused" : receivedSnapshot ? "No incidents recorded" : "Waiting for detector history"}</strong>
              <p>{connection === "offline" ? "The API is unreachable. The feed will resume when the connection returns." : "Severity-graded incidents will appear here when the error rate leaves its normal range."}</p>
            </div>
          </div>
        )}
      </section>

      <footer className="console-footer">
        <span>LOG-SEISMO / DETECTOR CONSOLE</span>
        <span>FIVE-MINUTE TELEMETRY WINDOW</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);