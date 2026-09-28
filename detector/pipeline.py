"""Glue: tail file -> parse -> detector -> callbacks.

Run standalone (no web server) to test detection in the terminal:
    python -m detector.pipeline logs/app.log
"""
import json
import sys
import threading
import time
from typing import Callable, Optional

from config import settings
from .engine import AnomalyDetector, Alert, Metric
from .parser import parse_line, to_epoch
from .tailer import follow


def run_pipeline(
    path: str,
    on_metric: Callable[[Metric], None],
    on_alert: Callable[[Alert], None],
    stop_event: Optional[threading.Event] = None,
) -> None:
    det = AnomalyDetector(
        window_sec=settings.window_sec,
        warmup_sec=settings.warmup_sec,
        min_events=settings.min_events,
        cooldown_sec=settings.cooldown_sec,
        ewma_alpha=settings.ewma_alpha,
        recovery_ticks=settings.recovery_ticks,
        adapt_max_z=settings.adapt_max_z,
        renotify_sec=settings.renotify_sec,
    )
    next_tick = time.time()
    for line in follow(path, stop_event=stop_event):
        now = time.time()
        if line:
            parsed = parse_line(line)
            if parsed:
                det.add(now, parsed["level"], line, log_ts=to_epoch(parsed["ts"]))
        if now >= next_tick:
            metric, alert = det.evaluate(now)
            on_metric(metric)
            if alert:
                on_alert(alert)
            next_tick = now + settings.tick_sec


def _cli() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else settings.log_path

    def show_metric(m: Metric) -> None:
        state = "learning" if m.warming_up else f"baseline {m.baseline:.1%}"
        print(f"\rrate {m.error_rate:6.1%}  ({m.errors}/{m.total})  {state}   ", end="", flush=True)

    def show_alert(a: Alert) -> None:
        print("\n" + json.dumps(a.to_dict(), indent=2))

    print(f"Watching {path}  (Ctrl+C to stop)")
    try:
        run_pipeline(path, show_metric, show_alert)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    _cli()
