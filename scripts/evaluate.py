"""Offline benchmark: replay synthetic traffic through the detector and score it.

Traffic mimics generator/log_generator.py: ~20 lines/s, 3% normal errors, and an
incident (12-60% errors for 15-30 s) every N seconds. Reports, per injected incident:
- alerted: a new alert fired for it (mean time-to-detect = incident start -> that alert)
- covered: alerted, or it happened while an already-alerted incident was still open
  (so the operator is already paged and the dashboard shows it as ongoing)
and false alarms (alerts with no injected incident nearby).

    python -m scripts.evaluate
    python -m scripts.evaluate --alpha 0.05 --adapt-z 2.5   # compare settings
"""
import argparse
import random
import statistics

from detector.engine import AnomalyDetector


def simulate(alpha, adapt_z, every, seed, duration, window=30):
    random.seed(seed)
    det = AnomalyDetector(window_sec=window, warmup_sec=30, cooldown_sec=15,
                          ewma_alpha=alpha, adapt_max_z=adapt_z)
    incidents = []  # [start, end, first_alert_delay or None, covered]
    t, next_burst, until, p_burst, false_alarms = 0.0, every or float("inf"), -1.0, 0.0, 0
    while t < duration:
        if t >= next_burst:
            until = t + random.uniform(15, 30)
            p_burst = random.uniform(0.12, 0.6)
            next_burst = t + every
            incidents.append([t, until, None, False])
        p_err = p_burst if t < until else 0.03
        det.add(t, "ERROR" if random.random() < p_err else "INFO")
        nt = t + random.expovariate(20)
        if int(nt) > int(t):  # one evaluation tick per second
            _, alert = det.evaluate(float(int(nt)))
            if det._incident is not None:
                for i in incidents:
                    if i[0] <= t <= i[1]:
                        i[3] = True
            if alert and alert.kind == "anomaly":
                match = [i for i in incidents if i[0] <= alert.timestamp <= i[1] + window]
                if not match:
                    false_alarms += 1
                elif match[0][2] is None:
                    match[0][2] = alert.timestamp - match[0][0]
                    match[0][3] = True
        t = nt
    return incidents, false_alarms


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--alpha", type=float, default=0.02)
    ap.add_argument("--adapt-z", type=float, default=2.0)
    ap.add_argument("--seeds", type=int, default=3)
    a = ap.parse_args()

    for label, every, duration in (("incident every 90s", 90, 1800),
                                   ("incident every 50s", 50, 1800),
                                   ("normal traffic only", 0, 3600)):
        detected, covered, total, fa, delays = 0, 0, 0, 0, []
        for seed in range(a.seeds):
            incidents, f = simulate(a.alpha, a.adapt_z, every, seed, duration)
            total += len(incidents)
            fa += f
            hits = [i[2] for i in incidents if i[2] is not None]
            detected += len(hits)
            covered += sum(i[3] for i in incidents)
            delays += hits
        delay = f"{statistics.fmean(delays):.1f}s" if delays else "-"
        hours = a.seeds * duration / 3600
        print(f"{label:22} alerted {detected:>3}/{total:<3} covered {covered:>3}/{total:<3} "
              f"mean time-to-detect {delay:>6}  false alarms {fa} ({fa / hours:.2f}/h)")


if __name__ == "__main__":
    main()
