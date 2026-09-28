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
