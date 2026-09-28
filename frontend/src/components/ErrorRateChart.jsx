import { useEffect, useRef, useState } from "react";
import { clock, pct, sevLabel } from "../format.js";

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const RANGES = [{ label: "1m", sec: 60 }, { label: "5m", sec: 300 }];
const PAD = { l: 48, r: 16, t: 20, b: 28 };

/** Canvas chart: error-rate trace, learned normal band, alert threshold, alert markers, hover readout. */
export default function ErrorRateChart({ metrics, alerts }) {
  const canvasRef = useRef(null);
  const [span, setSpan] = useState(300);
  const [hover, setHover] = useState(null); // { x, m }
  const live = useRef({});
  live.current = { metrics, alerts, span, hover };

  useEffect(() => {
    let frame;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const cv = canvasRef.current;
      if (!cv) return;
      const { metrics, alerts, span, hover } = live.current;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const now = metrics.length ? metrics[metrics.length - 1].timestamp : Date.now() / 1000;
      const t0 = now - span;
      const shown = metrics.filter((m) => m.timestamp >= t0);
      const peak = Math.max(0.1, ...shown.map((m) => Math.max(m.error_rate, m.upper_band || 0)));
      const yMax = Math.ceil(peak * 1.15 * 20) / 20;
      const X = (t) => PAD.l + ((t - t0) / span) * (w - PAD.l - PAD.r);
      const Y = (v) => h - PAD.b - (v / yMax) * (h - PAD.t - PAD.b);
      const font = css("--font-sans");

      // grid + axes
      g.font = `500 11px ${font}`;
      g.lineWidth = 1;
      const step = yMax > 0.5 ? 0.2 : yMax > 0.2 ? 0.1 : 0.05;
      for (let v = 0; v <= yMax + 1e-9; v += step) {
        g.strokeStyle = css("--grid");
        g.beginPath(); g.moveTo(PAD.l, Math.round(Y(v)) + 0.5); g.lineTo(w - PAD.r, Math.round(Y(v)) + 0.5); g.stroke();
        g.fillStyle = css("--text-3");
        g.textAlign = "right";
        g.fillText(Math.round(v * 100) + "%", PAD.l - 10, Y(v) + 4);
      }
      g.textAlign = "center";
      const tick = span <= 60 ? 15 : 60;
      for (let s = 0; s <= span; s += tick) {
        const label = s === span ? "now" : `-${span - s < 60 ? `${span - s}s` : `${(span - s) / 60}m`}`;
        g.fillText(label, Math.min(Math.max(X(t0 + s), PAD.l + 12), w - PAD.r - 12), h - 8);
      }

      // learned normal band + alert threshold
      const learned = shown.filter((m) => !m.warming_up);
      if (learned.length > 1) {
        g.fillStyle = css("--band");
        g.beginPath();
        learned.forEach((m, i) => g[i ? "lineTo" : "moveTo"](X(m.timestamp), Y(m.upper_band)));
        for (let i = learned.length - 1; i >= 0; i--) {
          const m = learned[i];
          g.lineTo(X(m.timestamp), Y(Math.max(0, 2 * m.baseline - m.upper_band)));
        }
        g.closePath(); g.fill();
        g.strokeStyle = css("--threshold"); g.setLineDash([4, 4]); g.lineWidth = 1;
        g.beginPath();
        learned.forEach((m, i) => g[i ? "lineTo" : "moveTo"](X(m.timestamp), Y(m.upper_band)));
        g.stroke(); g.setLineDash([]);
      }

      // alert markers
      for (const a of alerts) {
        if (a.timestamp < t0) continue;
        const x = Math.round(X(a.timestamp)) + 0.5;
        const c = a.kind === "recovery" ? css("--ok") : css("--sev-" + a.severity.toLowerCase());
        g.strokeStyle = c; g.globalAlpha = 0.35; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, PAD.t + 8); g.lineTo(x, h - PAD.b); g.stroke();
        g.globalAlpha = 1; g.fillStyle = c;
        g.beginPath(); g.moveTo(x - 5, PAD.t); g.lineTo(x + 5, PAD.t); g.lineTo(x, PAD.t + 8); g.closePath(); g.fill();
      }

      // error-rate trace with soft fill
      if (shown.length > 1) {
        const trace = css("--accent");
        const grad = g.createLinearGradient(0, PAD.t, 0, h - PAD.b);
        grad.addColorStop(0, css("--accent-fill")); grad.addColorStop(1, "transparent");
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(X(shown[0].timestamp), Y(0));
        shown.forEach((m) => g.lineTo(X(m.timestamp), Y(m.error_rate)));
        g.lineTo(X(shown[shown.length - 1].timestamp), Y(0));
        g.closePath(); g.fill();
        g.strokeStyle = trace; g.lineWidth = 2; g.lineJoin = "round";
        g.beginPath();
        shown.forEach((m, i) => g[i ? "lineTo" : "moveTo"](X(m.timestamp), Y(m.error_rate)));
        g.stroke();
        const lastM = shown[shown.length - 1];
        g.fillStyle = trace;
        g.beginPath(); g.arc(X(lastM.timestamp), Y(lastM.error_rate), 3.5, 0, Math.PI * 2); g.fill();
      }

      // hover cursor
      if (hover?.m) {
        const x = Math.round(X(hover.m.timestamp)) + 0.5;
        g.strokeStyle = css("--text-3"); g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, PAD.t); g.lineTo(x, h - PAD.b); g.stroke();
        g.fillStyle = css("--surface"); g.strokeStyle = css("--accent"); g.lineWidth = 2;
        g.beginPath(); g.arc(x, Y(hover.m.error_rate), 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const onMove = (e) => {
    const cv = canvasRef.current;
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (!metrics.length) return;
    const now = metrics[metrics.length - 1].timestamp;
    const t = now - span + ((x - PAD.l) / (rect.width - PAD.l - PAD.r)) * span;
    let best = null;
    for (const m of metrics) if (!best || Math.abs(m.timestamp - t) < Math.abs(best.timestamp - t)) best = m;
    const near = alerts.find((a) => Math.abs(a.timestamp - best.timestamp) < span / 150);
    setHover({ x, m: best, a: near });
  };

  return (
    <section className="card chart-card" aria-label="Error rate over time">
      <div className="card-head">
        <div>
          <h2>Error rate</h2>
          <p className="muted">Sliding-window error rate against the learned normal range</p>
        </div>
        <div className="segmented" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.label} type="button" aria-pressed={span === r.sec} onClick={() => setSpan(r.sec)}>{r.label}</button>
          ))}
        </div>
      </div>
      <div className="chart-wrap">
        <canvas ref={canvasRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        {hover?.m && (
          <div className="tooltip" style={{ left: Math.min(hover.x + 14, (canvasRef.current?.clientWidth || 0) - 220) }}>
            <div className="tooltip-time">{clock(hover.m.timestamp)}</div>
            <div className="tooltip-row"><span className="key"><i className="dot-accent" />Error rate</span><b>{pct(hover.m.error_rate)}</b></div>
            <div className="tooltip-row"><span className="key"><i className="dot-band" />Baseline</span><b>{hover.m.warming_up ? "learning" : pct(hover.m.baseline)}</b></div>
            <div className="tooltip-row"><span className="key">Lines in window</span><b>{hover.m.errors} / {hover.m.total}</b></div>
            {hover.a && (
              <div className={`tooltip-alert ${hover.a.kind === "recovery" ? "ok" : hover.a.severity.toLowerCase()}`}>
                {hover.a.kind === "recovery" ? "Recovered" : `${sevLabel(hover.a.severity)} alert`}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="legend">
        <span><i className="sw sw-line" />Error rate</span>
        <span><i className="sw sw-band" />Normal range</span>
        <span><i className="sw sw-dash" />Alert threshold</span>
        <span><i className="sw sw-tri" />Alert</span>
        <span><i className="sw sw-tri ok" />Recovery</span>
      </div>
    </section>
  );
}
