import { useEffect, useRef } from "react";

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Canvas chart: error rate trace, learned normal band, and a marker per alert. */
export default function ErrorRateChart({ metrics, alerts, spanSec }) {
  const ref = useRef(null);
  const data = useRef({ metrics, alerts });
  data.current = { metrics, alerts };

  useEffect(() => {
    let frame;
    const draw = () => {
      const cv = ref.current;
      if (!cv) return;
      const { metrics, alerts } = data.current;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const pad = { l: 44, r: 8, t: 10, b: 22 };
      const now = metrics.length ? metrics[metrics.length - 1].timestamp : Date.now() / 1000;
      const t0 = now - spanSec;
      const peak = Math.max(0.1, ...metrics.map((m) => Math.max(m.error_rate, m.upper_band || 0)));
      const yMax = Math.ceil(peak * 1.15 * 20) / 20;
      const X = (t) => pad.l + ((t - t0) / spanSec) * (w - pad.l - pad.r);
      const Y = (v) => h - pad.b - (v / yMax) * (h - pad.t - pad.b);

      g.font = `11px ${css("--sans")}`;
      g.fillStyle = css("--muted");
      g.strokeStyle = css("--grid");
      g.lineWidth = 1;
      const step = yMax > 0.5 ? 0.2 : yMax > 0.2 ? 0.1 : 0.05;
      for (let v = 0; v <= yMax + 1e-9; v += step) {
        g.beginPath(); g.moveTo(pad.l, Y(v) + 0.5); g.lineTo(w - pad.r, Y(v) + 0.5); g.stroke();
        g.fillText(Math.round(v * 100) + "%", 4, Y(v) + 4);
      }
      for (let s = 0; s <= spanSec; s += 60) {
        const x = X(t0 + s);
        g.fillText(s === spanSec ? "now" : `-${(spanSec - s) / 60}m`, x - (s === spanSec ? 22 : 10), h - 5);
      }

      const learned = metrics.filter((m) => !m.warming_up);
      if (learned.length > 1) {
        g.fillStyle = css("--band");
        g.beginPath();
        learned.forEach((m, i) => g[i ? "lineTo" : "moveTo"](X(m.timestamp), Y(m.upper_band)));
        for (let i = learned.length - 1; i >= 0; i--) {
          const m = learned[i];
          g.lineTo(X(m.timestamp), Y(Math.max(0, 2 * m.baseline - m.upper_band)));
        }
        g.closePath(); g.fill();
      }

      for (const a of alerts) {
        if (a.timestamp < t0) continue;
        const x = Math.round(X(a.timestamp)) + 0.5;
        g.strokeStyle = a.kind === "recovery" ? css("--ok") : css("--" + a.severity.toLowerCase());
        g.lineWidth = 1.5;
        g.setLineDash(a.kind === "recovery" ? [4, 3] : []);
        g.beginPath(); g.moveTo(x, pad.t); g.lineTo(x, h - pad.b); g.stroke();
        g.setLineDash([]);
        g.fillStyle = g.strokeStyle;
        g.fillRect(x - 3, pad.t, 6, 6);
      }

      if (metrics.length > 1) {
        g.strokeStyle = css("--trace"); g.lineWidth = 1.75; g.lineJoin = "round";
        g.beginPath();
        metrics.forEach((m, i) => g[i ? "lineTo" : "moveTo"](X(m.timestamp), Y(m.error_rate)));
        g.stroke();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [spanSec]);

  return (
    <section className="recorder" aria-label="Error rate over the last five minutes">
      <canvas ref={ref} />
      <div className="legend">
        <span><span className="swatch" style={{ background: "var(--trace)" }} />Error rate, sliding window</span>
        <span><span className="swatch" style={{ background: "var(--band)", height: 10 }} />Normal range (baseline)</span>
        <span><span className="swatch" style={{ background: "var(--high)" }} />Alert</span>
        <span><span className="swatch dashed" />Recovered</span>
      </div>
    </section>
  );
}
