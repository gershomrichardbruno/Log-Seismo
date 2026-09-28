# Log-Seismo: pitch content

Target length: about 5 minutes, then Q&A. Seven slides plus a live demo.

---

## Slide 1: Title
**Log-Seismo** — a seismograph for your logs.
Real-time log anomaly detection that raises an explained alert within seconds of errors spiking.
*Team: [you] · Hannah · Robert · [pitch member 1] · [pitch member 2]*

## Slide 2: The problem
- Production systems write thousands of log lines a minute. Outages start as a rise in errors that nobody is watching.
- Static thresholds ("alert if more than 50 errors") are wrong in both directions: noisy on busy services, blind on quiet ones.
- Research detectors (DeepLog, LogAnomaly, LogBERT) are accurate but heavy. They report **throughput**, not **how fast an alert reaches a human**.

> Line to say: *"The question an on-call engineer cares about is not 'how many lines per second can you read' but 'how soon do I find out?'"*

## Slide 3: Our idea
A **lightweight, adaptive, explainable** detector optimised for **time from anomaly to alert**.

```
growing log → sliding window → adaptive baseline → z-score severity
            → incident grouping + recovery → WebSocket dashboard + CloudWatch/SNS
```
- No training and no GPU. It starts learning the moment it's pointed at a file.
- Every alert explains itself: *"Error rate 12.8% vs normal 3.5%, 81 errors in 30 s."*

## Slide 4: How it works (the three clever bits)
1. **Learns normal automatically.** A robust warm-up (median/MAD) is followed by a slowly adapting baseline.
2. **Refuses to learn from trouble.** The baseline only updates on clearly normal periods, so an incident never becomes the "new normal".
3. **Thinks in incidents, not alert spam.** A cooldown suppresses repeats, escalation always gets through, and one recovery alert closes the incident.

Severity: LOW / MEDIUM / HIGH / CRITICAL = 2.5σ / 3.5σ / 5σ / 7σ above normal. SNS pages people only for HIGH and above.

## Slide 5: LIVE DEMO (about 90 seconds)
See the demo script below.

## Slide 6: Results
| Metric | Result |
|---|---|
| Time to detect an incident (benchmark mean) | **≈ 3.5 s** |
| Detection lag, error line written → alert (live) | **< 1 s** |
| Delivery, alert → dashboard | **single-digit ms** (WebSocket) |
| Incidents detected, heavy load (every 50 s) | **105/105** (the naive version: 15/105) |
| False alarms, 3 h of normal traffic | **0** |

> Story to tell: *"While testing we found the textbook approach quietly breaks. With frequent incidents, its idea of 'normal' drifted from 3% to 19% errors and it stopped seeing new incidents. We fixed it by gating what the baseline learns from. That took detection from 15 of 105 incidents to 105 of 105 with zero false alarms."* (Judges like a found-and-fixed bug backed by numbers.)

## Slide 7: What's next
- More signals: log-volume drops (a silent service), brand-new error signatures.
- Evaluate on public labelled datasets (Loghub BGL/HDFS) against DeepLog-style baselines.
- Deploy as a container on EC2 or a sidecar. Add Slack or PagerDuty targets.

**Close:** *"Log-Seismo turns a wall of logs into one explained, graded alert within about a second, and tells you when it's over."*

---

## Demo script
Before going on stage: start the generator and server at least 2 minutes early so the baseline has learned. Open the dashboard full screen. Have an SNS email inbox open on a phone.

1. **Calm state (15 s).** "The blue line is the live error rate. The shaded band is what the system has learned as normal, about 3%. We never told it that number."
2. **Incident (30 s).** When the generator's burst hits (or trigger one; see below), point at:
   - the banner turning red,
   - alerts escalating LOW → MEDIUM → HIGH,
   - the sentence explaining why,
   - expanding an alert to show the actual error lines.
3. **Latency tiles (15 s).** "Detection lag under a second, delivery to this screen in milliseconds."
4. **Cloud (15 s).** Show the SNS email on a phone or the CloudWatch log group.
5. **Recovery (15 s).** The green "Recovered" alert says how long the incident lasted and its peak severity.

To trigger an incident on cue, run the generator with a short gap:
```bash
python -m generator.log_generator --out logs/app.log --burst-every 45
```

## Likely judge questions
- **Why not ML or deep learning?** Our literature review shows DeepLog, LogAnomaly and LogBERT need training and compute, and they don't optimise alert latency. We start instantly, need no labels, and every alert is explainable. ML can be layered on later (Isolation Forest on window features).
- **What if normal behaviour changes?** The baseline adapts continuously (EWMA) but only from calm periods. A deliberate trade-off: slow drift is learned, and incidents are not.
- **How do you avoid alert fatigue?** Cooldown, escalation-only repeats, incident grouping, recovery alerts, and SNS only for HIGH+.
- **How do you know it works?** 10 automated tests plus a reproducible benchmark (`python -m scripts.evaluate`).
- **Limitations?** It detects error-rate anomalies, not sequence or semantic ones. The benchmark is synthetic so far. Say this confidently; it shows maturity.
