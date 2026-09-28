import { SEVERITIES, clock, ms, pct, sevLabel } from "../format.js";

function AlertItem({ a, acked, onAck }) {
  const recovery = a.kind === "recovery";
  const color = recovery ? "var(--ok)" : `var(--${a.severity.toLowerCase()})`;
  const delivery = a.receivedAt ? (a.receivedAt - a.timestamp) * 1000 : null;
  return (
    <li className={`alert${a.fresh ? " fresh" : ""}${acked ? " acked" : ""}`} style={{ "--c": color }}>
      <details>
        <summary>
          <span className="sev">{recovery ? "Recovered" : sevLabel(a.severity)}</span>
          <span className="time">{clock(a.timestamp)}</span>
          <span className="nums">
            {recovery
              ? a.message
              : <>{pct(a.error_rate)} errors, normally {pct(a.baseline)} <span className="z">({a.errors} of {a.total} lines)</span></>}
          </span>
          <span className="z">{recovery ? "" : `z = ${a.z_score}`}</span>
          {!recovery && (
            <button
              type="button"
              className="ack"
              onClick={(e) => { e.preventDefault(); onAck(a.id); }}
              disabled={acked}
            >
              {acked ? "Acked" : "Ack"}
            </button>
          )}
        </summary>
        <div className="detail">
          <p>{a.message}</p>
          <p className="lat">
            Detection lag {ms(a.detection_lag_ms)} · Delivery to dashboard {ms(delivery)}
            {a.incident_id && <> · Incident <code>{a.incident_id}</code></>}
          </p>
          {a.sample_lines?.length > 0 && <pre>{a.sample_lines.join("\n")}</pre>}
        </div>
      </details>
    </li>
  );
}

export default function AlertFeed({ alerts, filter, setFilter, acked, onAck }) {
  const shown = alerts.filter(
    (a) => a.kind === "recovery" ? filter.showRecovery : SEVERITIES.indexOf(a.severity) >= SEVERITIES.indexOf(filter.minSeverity)
  );
  return (
    <section>
      <div className="feed-head">
        <h2>Alerts <span>{shown.length}{shown.length !== alerts.length ? ` of ${alerts.length}` : ""}</span></h2>
        <div className="filters" role="group" aria-label="Filter alerts">
          <label>
            Minimum severity{" "}
            <select value={filter.minSeverity} onChange={(e) => setFilter({ ...filter, minSeverity: e.target.value })}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{sevLabel(s)}</option>)}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={filter.showRecovery}
              onChange={(e) => setFilter({ ...filter, showRecovery: e.target.checked })}
            />{" "}
            Show recoveries
          </label>
        </div>
      </div>
      <ul id="feed">
        {shown.length === 0 && (
          <li className="empty">No anomalies yet. Alerts appear here the moment the error rate breaks from its normal range.</li>
        )}
        {shown.map((a) => <AlertItem key={a.id} a={a} acked={acked.has(a.id)} onAck={onAck} />)}
      </ul>
    </section>
  );
}
