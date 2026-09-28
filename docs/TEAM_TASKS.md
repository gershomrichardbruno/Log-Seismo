# Tasks for the remaining time

Everything in the minimum requirements already works on branch `feature/react-dashboard`. What's left is **making the AWS part real**, **a couple of dev upgrades**, and **preparing the pitch and demo**.

**Team:** Hannah Bijumone (team leader), Gershom Richard Bruno, Rithika S, Caroline Mireya Regi, Aira Salish.

The pitch deck is already drafted (Claude artifact; Aira has the link). Slides should polish it, not start over.

First, developers: pull `main` and run the project once (README → "Run it").

---

## Gershom Richard Bruno: AWS live + dashboard alerts

1. **SNS + CloudWatch live (about 30 min).** This makes the requirement "push alerts to AWS CloudWatch Logs or SNS" provable on stage. Follow [`docs/AWS_SETUP.md`](AWS_SETUP.md) click by click, then run `python -m scripts.aws_check` until all lines say `[ok]`. Screenshot the SNS email and the CloudWatch log group for Rithika and Caroline. Never commit `.env` or keys.
2. **Browser notification + sound for HIGH/CRITICAL (about 20 min, optional).** In `frontend/src/hooks/useLiveFeed.js`, when a fresh alert with kind "anomaly" and severity HIGH or CRITICAL arrives, show a desktop notification (Notification API, ask permission on first click) and play a short beep (Web Audio API). Put this in a new hook `useAlertNotifications.js` used from `App.jsx`, then `cd frontend && npm run build`.
3. **Stand-by on stage:** show the SNS email arriving on your phone during the demo.

## Hannah Bijumone (team leader): detector and dev upgrades (uses Claude Pro)

Work on branch `feature/detection`. For each task, paste the prompt into Claude, review the diff, and run `pytest` and `python -m scripts.evaluate` before committing. Don't change existing alert fields; only add new ones, and document them in `docs/ALERT_SCHEMA.md`.

1. **Top error signatures in every alert (about 25 min).** This makes the explanation say *"DB connection timeout ×45"* instead of just a rate.
   > In this repo, `detector/engine.py` builds an `Alert` with `sample_lines`. Add a field `top_errors: list` holding the 3 most frequent error messages in the current window as `{"signature": str, "count": int}`. Normalise messages into a signature by stripping the timestamp and level and replacing numbers, hex IDs and quoted values with `<*>` (e.g. "DB connection timeout after 2011ms" → "DB connection timeout after <*>ms"). Keep the per-window counts updated incrementally in `add`/`_evict` (no full rescan per tick). Append the top signature to the alert `message`. Add pytest tests. Then show `top_errors` in `frontend/src/components/AlertFeed.jsx` in the expanded detail as "signature ×count", and update `docs/ALERT_SCHEMA.md`.
2. **Log-volume drop detection: "silent service" (about 30 min).** A crashed service often stops logging instead of logging errors.
   > In `detector/engine.py`, add a second signal: lines per second in the window. Learn its baseline the same way as the error rate (robust median/MAD warm-up, then EWMA only from clearly normal ticks). When volume falls more than 4 std devs below its baseline, and to under 50% of it, raise an anomaly alert with a new field `signal: "volume_drop"`; existing error-rate alerts get `signal: "error_rate"`. Reuse the incident, cooldown and recovery logic. Add pytest tests (normal traffic → no alert; traffic drops to 10% → alert; traffic returns → recovery). Add a `--pause-every` option to `generator/log_generator.py` that stops writing for 20 s. Show the signal in `AlertFeed.jsx`. Update `docs/ALERT_SCHEMA.md` and the benchmark in `scripts/evaluate.py`.
3. **One-command run with Docker (about 15 min, if time allows).**
   > Add a multi-stage `Dockerfile` (a Node stage builds `frontend/dist`; a Python 3.12 slim stage runs `uvicorn backend.app:app --host 0.0.0.0`) and a `docker-compose.yml` with two services, `app` and `generator`, sharing a `logs` volume. Pass AWS settings from `.env`. Add a "Run with Docker" section to the README.

If task 2 lands, tell Rithika and Caroline to move "log-volume drops" from "What's next" to "How it works" in `docs/PITCH.md`.

## Rithika S and Caroline Mireya Regi: slides + demo safety net

1. **Slides (about 40 min).** Build 7 slides from `docs/PITCH.md`. Put the architecture diagram on slide 3 and the results table on slide 6. Get dashboard screenshots taken while an incident is showing, and the AWS screenshots from Gershom.
2. **Backup video (about 10 min).** Screen-record one full incident cycle: calm → alerts escalate → recovery. If the live demo breaks on stage, play this.
3. **Benchmark screenshot.** Get the output of `python -m scripts.evaluate` for the results slide.
4. **Rehearse** the demo script in `docs/PITCH.md` once with a timer. Target 5 minutes.

## Aira Salish: integration + technical Q&A

1. Push the branch, open the PR, and merge into `main` once Gershom's AWS check passes.
2. Review and merge Hannah's `feature/detection` PRs. Rebuild the frontend after merging (`npm run build`).
3. Own the demo machine: start the generator and server 2+ minutes before presenting.
4. Read `docs/WORKLOG.md`. You answer the technical questions: baseline poisoning fix, median/MAD warm-up, why not deep learning.

## Merge order
`feature/react-dashboard` → `main` first. Then Gershom's notification hook and Hannah's `feature/detection` PRs, one at a time, rerunning `pytest` after each. Freeze `main` at least 20 minutes before presenting. Slides live outside the repo.
