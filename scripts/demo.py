"""One command to see Log-Seismo working: builds the dashboard if needed, starts the
fake log generator and the server, and opens the browser.

    python -m scripts.demo
    python -m scripts.demo --burst-every 60 --port 8000

Stop with Ctrl+C (stops everything).
"""
import argparse
import os
import shutil
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"


def build_frontend() -> None:
    if (FRONTEND / "dist" / "index.html").exists():
        return
    npm = shutil.which("npm")
    if not npm:
        sys.exit("The dashboard is not built and npm was not found. Install Node 18+ "
                 "(https://nodejs.org), then run this again.")
    print("Building the dashboard (first run only)...")
    if not (FRONTEND / "node_modules").exists():
        subprocess.run([npm, "install", "--no-audit", "--no-fund"], cwd=FRONTEND, check=True)
    subprocess.run([npm, "run", "build"], cwd=FRONTEND, check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--burst-every", type=float, default=90, help="seconds between injected incidents")
    ap.add_argument("--log", default="logs/demo.log")
    ap.add_argument("--no-browser", action="store_true", help="don't open a browser tab")
    a = ap.parse_args()

    build_frontend()
    log = ROOT / a.log
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text("")  # fresh file, so the baseline is learned from clean traffic

    # Short window and warm-up so the demo shows its first incident within ~2 minutes.
    env = {**os.environ, "LOG_PATH": str(log), "WINDOW_SEC": "30", "WARMUP_SEC": "30"}
    procs = [
        subprocess.Popen([sys.executable, "-m", "generator.log_generator", "--out", str(log),
                          "--burst-every", str(a.burst_every)], cwd=ROOT, env=env),
        subprocess.Popen([sys.executable, "-m", "uvicorn", "backend.app:app", "--port", str(a.port)],
                         cwd=ROOT, env=env),
    ]
    url = f"http://localhost:{a.port}"
    print(f"\nLog-Seismo is starting at {url}")
    print(f"It learns normal traffic for ~30 s; the first incident is injected after {a.burst_every:.0f} s.")
    print("Press Ctrl+C to stop.\n")
    if not a.no_browser:
        time.sleep(2.5)
        webbrowser.open(url)
    try:
        while all(p.poll() is None for p in procs):
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for p in procs:
            p.terminate()
        for p in procs:
            try:
                p.wait(5)
            except subprocess.TimeoutExpired:
                p.kill()
        print("Stopped.")


if __name__ == "__main__":
    main()
