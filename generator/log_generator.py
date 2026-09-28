"""Write realistic fake logs to a file forever, with periodic error bursts.

    python -m generator.log_generator --out logs/app.log
    python -m generator.log_generator --burst-every 60     # more frequent incidents
"""
import argparse
import os
import random
import time
from datetime import datetime

INFO_MSGS = [
    "GET /api/patients 200 {ms}ms", "POST /api/login 200 {ms}ms",
    "GET /api/reports/{id} 200 {ms}ms", "cache hit key=user:{id}",
    "job sync_records finished in {ms}ms", "user {id} logged out",
]
WARN_MSGS = [
    "slow query took {ms}ms", "retrying request to payments-svc (attempt 2)",
    "memory usage at {pct}%",
]
ERROR_MSGS = [
    "POST /api/checkout 500 Internal Server Error",
    "DB connection timeout after {ms}ms",
    "payments-svc returned 503 Service Unavailable",
    "NullPointerException in OrderService.process",
    "failed to write to S3 bucket: AccessDenied",
]


def _fill(msg: str) -> str:
    return msg.format(ms=random.randint(5, 2500), id=random.randint(1000, 9999), pct=random.randint(70, 97))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="logs/app.log")
    p.add_argument("--rate", type=float, default=20, help="lines per second")
    p.add_argument("--error-rate", type=float, default=0.03, help="normal error probability")
    p.add_argument("--burst-every", type=float, default=120, help="seconds between incidents")
    a = p.parse_args()

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    next_burst = time.time() + a.burst_every
    burst_until, burst_p = 0.0, 0.0
    print(f"Writing to {a.out}: {a.rate}/s, first incident in {a.burst_every:.0f}s (Ctrl+C to stop)")

    with open(a.out, "a", encoding="utf-8") as f:
        while True:
            now = time.time()
            if now >= next_burst:
                burst_until = now + random.uniform(15, 30)
                burst_p = random.uniform(0.12, 0.6)
                next_burst = now + a.burst_every
                print(f"[generator] incident started: error prob {burst_p:.0%} for {burst_until - now:.0f}s")

            p_err = burst_p if now < burst_until else a.error_rate
            r = random.random()
            if r < p_err:
                level, msg = "ERROR", random.choice(ERROR_MSGS)
            elif r < p_err + 0.07:
                level, msg = "WARN", random.choice(WARN_MSGS)
            else:
                level, msg = "INFO", random.choice(INFO_MSGS)

            ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S,%f")[:-3]
            f.write(f"{ts} {level} {_fill(msg)}\n")
            f.flush()
            time.sleep(random.expovariate(a.rate))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
