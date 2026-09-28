# Real-Time Log Anomaly Detector with Alert Feed

Watches a live log file, learns what a normal error rate looks like, and raises severity-graded alerts the moment errors spike. Alerts stream to a web dashboard over WebSockets and are pushed to AWS CloudWatch Logs and SNS.

## How it works

```
log file (keeps growing)
   │  tailer.py      follows new lines, survives rotation/truncation
   ▼
parser.py            line → {timestamp, level, message}
   ▼
engine.py            60 s sliding window → error rate
                     warm-up → baseline (mean, std), then EWMA updates on normal ticks only
                     z = (rate − baseline) / std → LOW / MEDIUM / HIGH / CRITICAL
   ▼
backend/app.py       FastAPI; WebSocket /ws + REST polling fallback
   ├──► frontend/             React + Vite live dashboard
   └──► aws_publisher.py      CloudWatch Logs (all alerts), SNS (HIGH and above)
```

Severity thresholds (standard deviations above baseline): LOW ≥ 2.5, MEDIUM ≥ 3.5, HIGH ≥ 5, CRITICAL ≥ 7. A cooldown (30 s) stops repeat alerts, but an escalation always fires. The baseline only learns from normal periods, so a long incident is never accepted as the new normal.

## Run it

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # Windows: copy .env.example .env
```

Terminal 1, fake log traffic with an incident every 2 minutes:
```bash
python -m generator.log_generator --out logs/app.log --burst-every 120
```

Terminal 2, build the dashboard and start the server:
```bash
cd frontend
npm install
npm run build
cd ..
uvicorn backend.app:app --reload
```
Open http://localhost:8000. The baseline takes about a minute to learn, then the first incident appears as an alert.

For frontend development with Vite hot reload, run the API server in one terminal:
```bash
uvicorn backend.app:app --reload
```
Then run Vite in another terminal:
```bash
cd frontend
npm run dev
```
Open the Vite URL shown in the terminal. REST and WebSocket requests are proxied to the API server on port 8000.

Detection only, no web server:
```bash
python -m detector.pipeline logs/app.log
```

Tests:
```bash
pytest
```

## AWS setup (optional)

1. Create an SNS topic and subscribe your email to it (confirm the email).
2. Configure credentials with `aws configure`, or use env vars. The IAM user needs `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` and `sns:Publish`.
3. In `.env` set `AWS_ENABLED=true` and `SNS_TOPIC_ARN=arn:aws:sns:...`.

The log group and stream are created automatically. With `AWS_ENABLED=false`, alerts are printed as `[mock AWS]` instead.

## Project layout

```
config.py                  settings from .env
generator/log_generator.py fake log traffic with incidents
detector/tailer.py         follow a growing file
detector/parser.py         parse log lines
detector/engine.py         sliding window, baseline, severity
detector/pipeline.py       glue + terminal mode
backend/app.py             FastAPI, WebSocket, REST
backend/aws_publisher.py   CloudWatch + SNS
frontend/index.html        Vite HTML shell
frontend/src/              React dashboard and styles
tests/                     pytest suite for the engine
docs/ALERT_SCHEMA.md       message formats shared by both halves
```

## Team split

| | Person A: detection | Person B: delivery |
|---|---|---|
| Owns | `generator/`, `detector/`, `tests/` | `backend/`, `frontend/`, AWS setup |
| Requirements | monitor growing log, sliding-window rate, baseline, deviation detection, severity | real-time frontend, live alert display, CloudWatch/SNS |
| Branch | `feature/detection` | `feature/dashboard` |

Both work against the shared contract in [`docs/ALERT_SCHEMA.md`](docs/ALERT_SCHEMA.md). See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow.
