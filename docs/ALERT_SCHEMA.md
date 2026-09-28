# Message formats (the contract between Person A and Person B)

Both halves of the project depend on these shapes. Change them only after both people agree.

## Alert
Produced by `detector/engine.py`, sent over the WebSocket as `{"type": "alert", "data": <Alert>}`, and pushed to CloudWatch/SNS.

```json
{
  "id": "a1b2c3d4e5f6",
  "kind": "anomaly",
  "timestamp": 1790580172.4,
  "timestamp_iso": "2026-09-28T10:02:52.400000+00:00",
  "severity": "HIGH",
  "message": "Error rate 34.2% vs normal 3.1% (410 errors in 1198 lines over the last 60s, 31.7 std devs above baseline)",
  "error_rate": 0.3421,
  "baseline": 0.0312,
  "baseline_std": 0.0098,
  "z_score": 31.7,
  "errors": 410,
  "total": 1198,
  "window_sec": 60,
  "sample_lines": ["2026-09-28 10:02:51,882 ERROR DB connection timeout after 2011ms"],
  "detection_lag_ms": 312.5,
  "incident_id": "9f8e7d6c5b4a"
}
```

`severity` is one of `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

`kind` is `anomaly` or `recovery`. A recovery is sent once when the rate has been normal for `RECOVERY_TICKS` ticks after an incident; its `severity` is the incident's peak, `sample_lines` is empty and `detection_lag_ms` is null. All alerts of one incident, including its recovery, share `incident_id`.

`detection_lag_ms` is the time from the newest error line's own timestamp to the alert being raised (null if the line had no parseable timestamp).

## Metric
Sent once per second as `{"type": "metric", "data": <Metric>}` for the live chart.

```json
{
  "timestamp": 1790580172.4,
  "error_rate": 0.034,
  "baseline": 0.031,
  "upper_band": 0.0555,
  "errors": 41,
  "total": 1203,
  "warming_up": false
}
```

`baseline` and `upper_band` are `null` while `warming_up` is true.

## WebSocket `/ws`
On connect the server sends `{"type": "snapshot", "data": {"alerts": [...], "metrics": [...]}}`, then streams `metric` and `alert` messages.

## REST (polling fallback)
`GET /api/alerts?since=<ts>`, `GET /api/metrics?since=<ts>`, `GET /api/health`
