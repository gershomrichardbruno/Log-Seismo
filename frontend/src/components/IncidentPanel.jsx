import { clock, duration, pct, sevLabel } from "../format.js";
import { SeverityBadge } from "./AlertFeed.jsx";
import { IconAlert, IconCheck } from "./Icons.jsx";

/** Current incident (if any) with a live timeline, else a summary of the last one. */
export default function IncidentPanel({ incidents, now }) {
  const open = incidents.find((i) => !i.resolved);
  const last = incidents.find((i) => i.resolved);
  const resolvedCount = incidents.filter((i) => i.resolved).length;

  return (
    <section className="panel incident-card" aria-label="Incident">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Incident / 02</p>
          <h2>{open ? "Active incident" : "Incidents"}</h2>
        </div>
        <span className="muted mono">{incidents.length} total · {resolvedCount} resolved</span>
      </div>

      {open ? (
        <div className={`incident open ${open.peak.toLowerCase()}`}>
          <div className="incident-top">
            <IconAlert width={20} height={20} />
            <div>
              <div className="incident-title">{sevLabel(open.peak)} incident</div>
              <div className="muted mono">#{open.id.slice(0, 8)} · started {clock(open.start)}</div>
            </div>
            <div className="incident-dur mono">{duration(now - open.start)}</div>
          </div>
          <p className="incident-msg">{open.latest.message}</p>
          <ol className="timeline">
            {open.alerts.slice().reverse().map((a) => (
              <li key={a.id}>
                <span className="mono muted">{clock(a.timestamp)}</span>
                <SeverityBadge alert={a} />
                <span className="mono">{pct(a.error_rate)}</span>
              </li>
            ))}
          </ol>
          {open.latest.sample_lines?.length > 0 && (
            <pre className="log">{open.latest.sample_lines.slice(0, 3).join("\n")}</pre>
          )}
        </div>
      ) : (
        <div className="incident calm">
          <div className="incident-top">
            <IconCheck width={20} height={20} />
            <div>
              <div className="incident-title">No active incident</div>
              <div className="muted">Error rate is inside its learned range.</div>
            </div>
          </div>
          {last ? (
            <dl className="facts">
              <div><dt>Last incident</dt><dd><SeverityBadge alert={{ kind: "anomaly", severity: last.peak }} /></dd></div>
              <div><dt>Resolved at</dt><dd className="mono">{clock(last.end)}</dd></div>
              <div><dt>Duration</dt><dd className="mono">{duration(last.end - last.start)}</dd></div>
              <div><dt>Alerts</dt><dd className="mono">{last.alerts.length}</dd></div>
            </dl>
          ) : (
            <p className="muted">Nothing unusual so far this session.</p>
          )}
        </div>
      )}
    </section>
  );
}
