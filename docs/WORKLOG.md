# What we built and why (explainable notes)

Plain-English record of each change, what it does, and why we made it. Useful for the report and for answering judges' questions.

## 1. Starting point

The first commit already covered most of the minimum requirements. It tails a growing log file and computes the error rate over a 60 s sliding window. It learns a baseline, scores deviations as a z-score, and sets severity from the z-score. It streams to a web page over WebSocket, falls back to REST polling, and publishes to CloudWatch and SNS.

Gap against the brief: the frontend was plain HTML, and the brief lists **React**.

## 2. Changes, one by one

### 2.1 React dashboard (`frontend/src/`)
- **What:** rebuilt the dashboard in React 18 with Vite. It has these parts:
  - `useLiveFeed` hook: a WebSocket, with automatic fallback to polling and reconnect.
  - `ErrorRateChart`: live error rate, the learned "normal" band, and alert markers.
  - `AlertFeed`: severity filter, acknowledge button, expandable detail showing sample log lines.
  - An incident banner and latency tiles.
- **Why:** the brief asks for React. The requirement "display alerts as they are generated" is met by pushing alerts over the WebSocket, which is faster than polling.

### 2.2 Recovery alerts and incidents (`detector/engine.py`)
- **What:** alerts that belong to the same problem share an `incident_id`. When the error rate stays normal for 5 s, one **recovery** alert closes the incident. That alert carries the incident's peak severity and duration.
- **Why:** without it, operators see "something is wrong" but never "it's fixed". Grouping alerts into incidents also reduces alert flooding (the alert-correlation idea from our literature review).

### 2.3 Explainable alert messages
- **What:** every alert carries a sentence, e.g. *"Error rate 12.8% vs normal 3.5% (81 errors in 631 lines over the last 30s, 5.0 std devs above baseline)"*.
- **Why:** research gap #8 (explainability). Operators need the reason for an alert in words they already use, not a model score.

### 2.4 Latency measurement (`detection_lag_ms`, dashboard "delivery")
- **What:** each alert records **detection lag**, the time from the newest error line being written to the alert being raised. The browser records **delivery latency**, the time from the alert being raised to it appearing on screen. Both appear as dashboard tiles.
- **Why:** our core research claim is fast anomaly → alert. Papers report throughput (lines per second), not this end-to-end time. Now we measure it. In the live run we observed about 0.3–0.9 s detection lag and single-digit milliseconds of delivery.

### 2.5 Non-blocking AWS publishing (`backend/aws_publisher.py`)
- **What:** CloudWatch and SNS calls now run on a background worker thread behind a queue.
- **Why:** before, a slow AWS call (often 100–500 ms) blocked the detector thread. That slowed detection and would have inflated our latency numbers. SNS also sends a "[RESOLVED]" message for recoveries.

### 2.6 Bug fix: baseline poisoning (the important one)
- **Observed:** in a live test with frequent incidents, the learned "normal" error rate drifted from 3% up to **19%**. After that, new incidents went **undetected**.
- **Cause:** the baseline learned from every tick below the alert threshold, including the elevated ramp before and after an incident. It also adapted too fast (α = 0.05 per second, about a 20 s memory).
- **Fix:** learn only from clearly normal ticks (z < 2.0, `ADAPT_MAX_Z`), and adapt more slowly (α = 0.02).
- **Evidence:** `python -m scripts.evaluate`, 3 random seeds per scenario:

| Setting | Incident every 90 s | Incident every 50 s | False alarms, 3 h normal |
|---|---|---|---|
| Original | 56/57 | **15/105** | 0 |
| Fixed | 57/57 | **105/105** | 0 |

We also tried stricter settings (z < 1.0). They caught everything but raised 11 false alarms in 5 hours, so we chose z < 2.0 as the balance.

### 2.7 Robust warm-up
- **Observed:** when the server started during an incident, the baseline was learned as 42%.
- **Fix:** the warm-up baseline now uses **median and MAD** (median absolute deviation) instead of mean and variance. A short burst during warm-up no longer skews it.

### 2.8 Tests and benchmark
- 10 automated tests (`pytest`), including regression tests for baseline poisoning, recovery, and a burst during warm-up.
- `scripts/evaluate.py` is an offline benchmark reporting detection rate, time-to-detect, and false alarms.

## 3. Requirement checklist

| Minimum requirement | Where |
|---|---|
| Monitor a continuously growing log file | `detector/tailer.py`. Handles rotation and truncation |
| Rolling error rate via sliding window | `detector/engine.py` (`_evict`, `evaluate`) |
| Baseline for normal behaviour | Robust warm-up, then gated EWMA |
| Detect deviations | z-score against the baseline |
| Severity levels | LOW 2.5σ, MEDIUM 3.5σ, HIGH 5σ, CRITICAL 7σ, plus recovery |
| Real-time frontend via WebSockets or polling | React + WebSocket, with polling fallback |
| Display alerts as generated | Live feed, banner, chart markers |
| Push to CloudWatch Logs or SNS | Both. CloudWatch gets every alert; SNS gets HIGH and above |

## 4. Known limitations (be upfront with judges)
- Detects **error-rate** anomalies only. It does not yet catch sequence or semantic anomalies (DeepLog / LogAnomaly territory) or a drop in log volume.
- If the normal error rate genuinely shifts upward, the baseline follows slowly on purpose. Until it catches up, you may see alerts.
- The benchmark uses synthetic traffic. A public labelled dataset such as Loghub BGL or HDFS is the next step.
