# Working on this repo

## Who owns what
- **Hannah (detection):** `generator/`, `detector/`, `tests/`
- **Gershom (delivery):** `backend/`, `frontend/`, AWS account and `.env` setup
- **Aira (integration + evaluation):** `scripts/`, benchmark results, report
- Shared, change together: `config.py`, `docs/ALERT_SCHEMA.md`, `README.md`

## Workflow
1. Never commit directly to `main`.
2. Work on your branch:
   ```bash
   git checkout -b feature/detection    # Hannah
   git checkout -b feature/dashboard    # Gershom
   git checkout -b feature/evaluation   # Aira
   ```
3. Commit small and often, then push: `git push -u origin <branch>`
4. Open a pull request into `main`. Someone else reviews and merges.
5. Before starting work each day: `git checkout main && git pull`, then `git checkout <branch> && git merge main`.

## Ideas to extend
- Person A: per-message-type anomalies (a new error signature appearing), log-volume drops, Isolation Forest on window features
- Person B: severity filter and acknowledge button, sound/browser notifications, Docker deployment on EC2
