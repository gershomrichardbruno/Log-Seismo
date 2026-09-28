from detector.engine import AnomalyDetector
from detector.parser import parse_line


def feed(det, start, seconds, per_sec, err_every):
    """Add `per_sec` events per second; every `err_every`-th event is an ERROR."""
    alerts, n = [], 0
    for s in range(seconds):
        t = start + s
        for i in range(per_sec):
            level = "ERROR" if err_every and n % err_every == 0 else "INFO"
            det.add(t + i / per_sec, level, f"{level} line {n}")
            n += 1
        _, alert = det.evaluate(t + 0.999)
        if alert:
            alerts.append(alert)
    return alerts


def make():
    return AnomalyDetector(window_sec=10, warmup_sec=20, min_events=10, cooldown_sec=5)


def test_no_alerts_during_normal_traffic():
    det = make()
    assert feed(det, 0, 60, 20, err_every=25) == []
    assert not det.warming_up
    assert 0.03 < det.mean < 0.05


def test_spike_raises_alert():
    det = make()
    feed(det, 0, 40, 20, err_every=25)          # ~4% errors
    alerts = feed(det, 40, 15, 20, err_every=2)  # 50% errors
    assert alerts
    assert alerts[-1].severity in ("HIGH", "CRITICAL")
    assert alerts[0].sample_lines


def test_cooldown_limits_repeats_but_escalation_fires():
    det = make()
    feed(det, 0, 40, 20, err_every=25)
    alerts = feed(det, 40, 20, 20, err_every=2)
    # 20s of incident with 5s cooldown: a handful, not one per second
    assert len(alerts) < 12
    order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    ranks = [order.index(a.severity) for a in alerts]
    assert max(ranks) >= ranks[0]


def test_baseline_not_poisoned_by_incident():
    det = make()
    feed(det, 0, 40, 20, err_every=25)
    before = det.mean
    feed(det, 40, 20, 20, err_every=2)
    assert abs(det.mean - before) < 0.02


def test_parser():
    p = parse_line("2026-09-28 10:00:03,120 ERROR payment failed")
    assert p["level"] == "ERROR" and p["msg"] == "payment failed"
    assert parse_line("[worker-3] WARN disk nearly full")["level"] == "WARN"
    assert parse_line("") is None


def test_recovery_alert_closes_incident():
    det = make()
    feed(det, 0, 40, 20, err_every=25)
    incident = feed(det, 40, 15, 20, err_every=2)
    after = feed(det, 55, 40, 20, err_every=25)  # back to normal; window drains, then recovery
    recoveries = [a for a in after if a.kind == "recovery"]
    assert len(recoveries) == 1
    rec = recoveries[0]
    assert rec.incident_id == incident[0].incident_id
    assert rec.severity == max((a.severity for a in incident), key=["LOW", "MEDIUM", "HIGH", "CRITICAL"].index)
    assert "Recovered" in rec.message
    # a fresh incident after recovery fires immediately, with a new incident id
    again = feed(det, 95, 10, 20, err_every=2)
    assert again and again[0].kind == "anomaly" and again[0].incident_id != rec.incident_id


def test_alert_has_message_and_detection_lag():
    det = make()
    feed(det, 0, 40, 20, err_every=25)
    alert = feed(det, 40, 15, 20, err_every=2)[0]
    assert alert.kind == "anomaly"
    assert "Error rate" in alert.message and "normal" in alert.message
    assert alert.detection_lag_ms is not None and alert.detection_lag_ms < 1000


def test_to_epoch():
    from detector.parser import to_epoch
    assert to_epoch("2026-09-28 10:00:03,120") is not None
    assert to_epoch("garbage") is None and to_epoch(None) is None


def test_frequent_incidents_do_not_poison_baseline():
    # Incidents every 50 s used to drag the baseline up until later ones went unseen.
    from scripts.evaluate import simulate
    incidents, false_alarms = simulate(alpha=0.02, adapt_z=2.0, every=50, seed=0, duration=1200)
    covered = sum(i[3] for i in incidents)
    assert covered >= 0.9 * len(incidents)
    assert false_alarms == 0


def test_warmup_ignores_short_burst():
    det = AnomalyDetector(window_sec=5, warmup_sec=30, min_events=10, cooldown_sec=5)
    feed(det, 0, 20, 20, err_every=25)   # normal
    feed(det, 20, 6, 20, err_every=2)    # burst inside warm-up
    feed(det, 26, 10, 20, err_every=25)  # normal again, warm-up ends
    assert not det.warming_up
    assert det.mean < 0.1


def test_long_incident_does_not_spam():
    det = make()  # cooldown 5 s
    feed(det, 0, 40, 20, err_every=25)
    alerts = feed(det, 40, 120, 20, err_every=2)  # 2-minute incident at a steady level
    # escalations only (at most one per severity), no repeat every cooldown
    assert len(alerts) <= 4
    assert len({a.incident_id for a in alerts}) == 1
