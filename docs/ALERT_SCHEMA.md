# Message formats (the contract between Person A and Person B)

Both halves of the project depend on these shapes. Change them only after both people agree.

## Alert
Produced by `detector/engine.py`, sent over the WebSocket as `{"type": "alert", "data": <Alert>}`, and pushed to CloudWatch/SNS.

```json
{
  "id": "a1b2c3d4e5f6",
  "timestamp": 1790580172.4,
  "timestamp_iso": "2026-09-28T10:02:52.400000+00:00",
  "severity": "HIGH",
  "error_rate": 0.3421,
  "baseline": 0.0312,
  "baseline_std": 0.0098,
  "z_score": 31.7,
  "errors": 410,
  "total": 1198,
  "window_sec": 60,
  "sample_lines": ["2026-09-28 10:02:51,882 ERROR DB connection timeout after 2011ms"]
}
```

`severity` is one of `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

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
