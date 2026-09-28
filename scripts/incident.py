"""Inject an incident on cue, for live demos: appends a burst of realistic ERROR
lines to the watched log file while the normal generator keeps running.

    python -m scripts.incident                 # 25 s burst, ~20 errors/s
    python -m scripts.incident --seconds 40 --rate 30

Within a few seconds the dashboard escalates and, with AWS on, the HIGH/CRITICAL
email goes out. When the burst ends, the RECOVERED alert (and email) follows.
"""
import argparse
import random
import time
from datetime import datetime

from config import settings

ERRORS = [
    "POST /api/checkout 500 Internal Server Error",
    "DB connection timeout after {ms}ms",
    "payments-svc returned 503 Service Unavailable",
    "NullPointerException in OrderService.process",
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=25)
    ap.add_argument("--rate", type=float, default=20, help="error lines per second")
    ap.add_argument("--log", default=settings.log_path)
    a = ap.parse_args()

    print(f"Injecting an incident into {a.log}: {a.rate:.0f} errors/s for {a.seconds:.0f}s ...")
    end = time.time() + a.seconds
    with open(a.log, "a", encoding="utf-8") as f:
        while time.time() < end:
            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S,%f")[:-3]
            msg = random.choice(ERRORS).format(ms=random.randint(1000, 3000))
            f.write(f"{ts} ERROR {msg}\n")
            f.flush()
            time.sleep(1 / a.rate)
    print("Incident over. The detector will send RECOVERED once the error rate settles.")


if __name__ == "__main__":
    main()
