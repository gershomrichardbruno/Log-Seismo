import { useState } from "react";
import { SEVERITIES, clock, ms, pct, sevLabel, sevRank } from "../format.js";
import { IconChevron, IconSearch } from "./Icons.jsx";

export function SeverityBadge({ alert }) {
  const recovery = alert.kind === "recovery";
  const cls = recovery ? "ok" : alert.severity.toLowerCase();
  return <span className={`badge ${cls}`}><i />{recovery ? "Recovered" : sevLabel(alert.severity)}</span>;
}

function AlertRow({ a, acked, onAck }) {
  const [open, setOpen] = useState(false);
  const recovery = a.kind === "recovery";
  const delivery = a.receivedAt ? (a.receivedAt - a.timestamp) * 1000 : null;
  return (
    <li className={`row sev-${recovery ? "ok" : a.severity.toLowerCase()}${a.fresh ? " fresh" : ""}${acked ? " acked" : ""}`}>
      <button type="button" className="row-main" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="c-sev"><SeverityBadge alert={a} /></span>
        <span className="c-time mono">{clock(a.timestamp)}</span>
        <span className="c-msg">{recovery ? a.message : `Error rate ${pct(a.error_rate)} vs normal ${pct(a.baseline)}`}</span>
        <span className="c-num mono">{recovery ? "" : `${a.errors}/${a.total}`}</span>
        <span className="c-num mono">{recovery ? "" : `z ${a.z_score.toFixed(1)}`}</span>
        <span className="c-num mono">{ms(a.detection_lag_ms)}</span>
        <IconChevron className={`chev${open ? " open" : ""}`} />
      </button>
      {!recovery && (
        <button type="button" className="btn-ghost c-ack" onClick={() => onAck(a.id)} disabled={acked}>
          {acked ? "Acknowledged" : "Acknowledge"}
        </button>
      )}
      {open && (
        <div className="row-detail">
          <p>{a.message}</p>
          <dl className="facts">
            <div><dt>Incident</dt><dd className="mono">{a.incident_id || "–"}</dd></div>
            <div><dt>Detection lag</dt><dd className="mono">{ms(a.detection_lag_ms)}</dd></div>
            <div><dt>Delivery</dt><dd className="mono">{ms(delivery)}</dd></div>
            <div><dt>Window</dt><dd className="mono">{a.window_sec}s</dd></div>
          </dl>
          {a.sample_lines?.length > 0 && (
            <>
              <h4>Sample error lines</h4>
              <pre className="log">{a.sample_lines.join("\n")}</pre>
            </>
          )}
        </div>
      )}
    </li>
  );
}

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "MEDIUM", label: "Medium+" },
  { key: "HIGH", label: "High+" },
  { key: "CRITICAL", label: "Critical" },
];

export default function AlertFeed({ alerts, acked, onAck, offline = false }) {
  const [min, setMin] = useState("ALL");
  const [showRecovery, setShowRecovery] = useState(true);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const shown = alerts.filter((a) => {
    if (a.kind === "recovery" ? !showRecovery : min !== "ALL" && sevRank(a.severity) < sevRank(min)) return false;
    if (!query) return true;
    return (a.message + " " + (a.sample_lines || []).join(" ")).toLowerCase().includes(query);
  });
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, alerts.filter((a) => a.kind !== "recovery" && a.severity === s).length]));

  return (
    <section className="feed-section" aria-label="Alert feed">
      <div className="section-heading feed-heading">
        <div>
          <p className="eyebrow">Response / 03</p>
          <h2>Incident feed <span className="count">{String(alerts.length).padStart(2, "0")} recorded</span></h2>
          <p className="muted severity-counts">
            {SEVERITIES.slice().reverse().map((s) => (
              <span key={s} className="mini-count"><i className={`dot ${s.toLowerCase()}`} />{counts[s]} {sevLabel(s)}</span>
            ))}
          </p>
        </div>
        <div className="toolbar">
          <label className="search">
            <IconSearch />
            <input type="search" placeholder="Search messages and log lines" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search alerts" />
          </label>
          <div className="segmented" role="group" aria-label="Minimum severity">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" aria-pressed={min === f.key} onClick={() => setMin(f.key)}>{f.label}</button>
            ))}
          </div>
          <label className="switch">
            <input type="checkbox" checked={showRecovery} onChange={(e) => setShowRecovery(e.target.checked)} />
            <span>Recoveries</span>
          </label>
        </div>
      </div>
      <div className="table-head" aria-hidden="true">
        <span>Severity</span><span>Time</span><span>Summary</span><span>Errors</span><span>Score</span><span>Lag</span><span />
      </div>
      <ul className="rows">
        {shown.length === 0 && (
          <li className="empty">
            <span className="feed-state-mark" aria-hidden="true">—</span>
            <div>
              <strong>{offline ? "Feed paused" : alerts.length ? "No alerts match these filters" : "No incidents recorded"}</strong>
              <p>{offline
                ? "The API is unreachable. The feed resumes when the connection returns."
                : alerts.length ? "Try a lower severity or clear the search." : "Severity-graded incidents appear here the moment the error rate leaves its normal range."}</p>
            </div>
          </li>
        )}
        {shown.map((a) => <AlertRow key={a.id} a={a} acked={acked.has(a.id)} onAck={onAck} />)}
      </ul>
    </section>
  );
}
