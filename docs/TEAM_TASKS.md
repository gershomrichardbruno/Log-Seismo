# Tasks for the remaining time

Everything in the minimum requirements already works on branch `feature/react-dashboard`. What's left is **making the AWS part real** and **preparing the pitch and demo**.

First, everyone: pull the branch and run the project once (README → "Run it").

---

## Hannah: AWS live + dashboard alerts (uses Claude Pro)

1. **SNS + CloudWatch live (about 30 min).** This makes the requirement "push alerts to AWS CloudWatch Logs or SNS" provable on stage.
   - In the AWS console, region ap-south-1:
     1. Create an SNS topic `log-seismo-alerts`.
     2. Subscribe your email and confirm it.
     3. Create an IAM user with `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents` and `sns:Publish`.
     4. Run `aws configure` with its keys.
   - In `.env`: `AWS_ENABLED=true`, `SNS_TOPIC_ARN=<topic arn>`.
   - Run the demo. Screenshot the SNS email and the CloudWatch log group `/log-anomaly-detector/alerts` for the slides.
   - Never commit `.env` or keys (they're already in `.gitignore`).
2. **Browser notification + sound for HIGH/CRITICAL (about 20 min, optional).** Paste into Claude:
   > In this repo, `frontend/src/hooks/useLiveFeed.js` receives alerts over WebSocket. Add a desktop browser notification (Notification API, ask permission on first click) and a short beep (Web Audio API, no audio files) when a fresh alert with kind "anomaly" and severity HIGH or CRITICAL arrives. Keep it in a small new hook `useAlertNotifications.js` used from `App.jsx`. Don't change the alert schema.
   - Then `cd frontend && npm run build` and check it in the browser.
3. **Stand-by on stage:** show the SNS email arriving on your phone during the demo.

## Robert: pitch deck + demo safety net

1. **Slides (about 40 min).** Build 7 slides from `docs/PITCH.md`. Put the architecture diagram on slide 3 and the results table on slide 6. For the chart and feed, take screenshots from http://localhost:8000 while an incident is showing.
2. **Backup video (about 10 min).** Screen-record one full incident cycle: calm → alerts escalate → recovery. If the live demo breaks on stage, play this.
3. **Benchmark screenshot.** Run `python -m scripts.evaluate` and screenshot the output for the results slide.
4. **Rehearse** the demo script in `docs/PITCH.md` once with a timer. Target 5 minutes.

## You: integration + technical Q&A

1. Push the branch, open the PR, and merge into `main` once Hannah's AWS check passes.
2. Own the demo machine: start the generator and server 2+ minutes before presenting.
3. Read `docs/WORKLOG.md`. You answer the technical questions: baseline poisoning fix, median/MAD warm-up, why not deep learning.

## Merge order
Hannah's notification hook (if done) → `feature/react-dashboard` → `main`. Slides live outside the repo.
