# Working on this repo (3 people)

## Who owns what
- **Person A (detection):** `generator/`, `detector/`, `tests/`
- **Person B (delivery):** `backend/`, `frontend/`, AWS account and `.env` setup
- **Person C (evaluation):** `scripts/`, benchmark results, report
- Shared, change together: `config.py`, `docs/ALERT_SCHEMA.md`, `README.md`

## Workflow
1. Never commit directly to `main`.
2. Work on your branch:
   ```bash
   git checkout -b feature/detection    # Person A
   git checkout -b feature/dashboard    # Person B
   git checkout -b feature/evaluation   # Person C
   ```
3. Commit small and often, then push: `git push -u origin <branch>`
4. Open a pull request into `main`. Someone else reviews and merges.
5. Before starting work each day: `git checkout main && git pull`, then `git checkout <branch> && git merge main`.

## Ideas to extend
- Person A: per-message-type anomalies (a new error signature appearing), log-volume drops, Isolation Forest on window features
- Person B: severity filter and acknowledge button, sound/browser notifications, Docker deployment on EC2
