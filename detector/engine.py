"""Sliding-window error rate, learned baseline, and anomaly scoring.

How it works
------------
1. Every log event goes into a time-based sliding window (default 60 s).
2. Once per tick we compute error_rate = errors / total inside the window.
3. Warm-up: for the first `warmup_sec` we only collect rates, then set the
   baseline mean and std from them.
4. After warm-up, z = (rate - mean) / std. A z above a threshold is an anomaly,
   and the size of z decides severity.
5. The baseline keeps adapting (EWMA) but only from normal ticks, so an
   ongoing incident does not become the "new normal".
6. A cooldown stops repeat alerts, but an escalation (e.g. MEDIUM -> HIGH)
   always fires.
"""
from __future__ import annotations

import math
import statistics
import uuid
from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Optional

from .parser import ERROR_LEVELS

SEVERITIES = ("LOW", "MEDIUM", "HIGH", "CRITICAL")
DEFAULT_THRESHOLDS = {"LOW": 2.5, "MEDIUM": 3.5, "HIGH": 5.0, "CRITICAL": 7.0}


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


@dataclass
class Metric:
    timestamp: float
    error_rate: float
    baseline: Optional[float]
    upper_band: Optional[float]
    errors: int
    total: int
    warming_up: bool

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Alert:
    id: str
    timestamp: float
    timestamp_iso: str
    severity: str
    error_rate: float
    baseline: float
    baseline_std: float
    z_score: float
    errors: int
    total: int
    window_sec: int
    sample_lines: list

    def to_dict(self) -> dict:
        return asdict(self)


class AnomalyDetector:
    def __init__(
        self,
        window_sec: int = 60,
        warmup_sec: int = 60,
        min_events: int = 20,
        cooldown_sec: int = 30,
        ewma_alpha: float = 0.05,
        std_floor: float = 0.01,
        thresholds: Optional[dict] = None,
    ):
        self.window_sec = window_sec
        self.warmup_sec = warmup_sec
        self.min_events = min_events
        self.cooldown_sec = cooldown_sec
        self.alpha = ewma_alpha
        self.std_floor = std_floor
        self.thresholds = thresholds or dict(DEFAULT_THRESHOLDS)

        self._events: deque = deque()  # (ts, is_error, line)
        self._errors = 0
        self._first_ts: Optional[float] = None
        self._warmup_rates: list = []
        self.mean: Optional[float] = None
        self.var: Optional[float] = None
        self._last_alert_ts: Optional[float] = None
        self._last_alert_sev: Optional[str] = None

    # ---- input -------------------------------------------------------------
    def add(self, ts: float, level: str, line: str = "") -> None:
        if self._first_ts is None:
            self._first_ts = ts
        is_err = level.upper() in ERROR_LEVELS
        self._events.append((ts, is_err, line))
        if is_err:
            self._errors += 1

    # ---- state -------------------------------------------------------------
    @property
    def warming_up(self) -> bool:
        return self.mean is None

    @property
    def std(self) -> float:
        return max(math.sqrt(self.var or 0.0), self.std_floor)

    def _evict(self, now: float) -> None:
        cutoff = now - self.window_sec
        while self._events and self._events[0][0] < cutoff:
            _, was_err, _ = self._events.popleft()
            if was_err:
                self._errors -= 1

    def _update_baseline(self, rate: float) -> None:
        a = self.alpha
        diff = rate - self.mean
        self.mean += a * diff
        self.var = (1 - a) * (self.var + a * diff * diff)

    def _severity(self, z: float) -> Optional[str]:
        level = None
        for sev in SEVERITIES:
            if z >= self.thresholds[sev]:
                level = sev
        return level

    def _should_fire(self, now: float, sev: str) -> bool:
        if self._last_alert_ts is None:
            return True
        if SEVERITIES.index(sev) > SEVERITIES.index(self._last_alert_sev):
            return True  # escalation always fires
        return now - self._last_alert_ts >= self.cooldown_sec

    # ---- main step ---------------------------------------------------------
    def evaluate(self, now: float) -> tuple[Metric, Optional[Alert]]:
        self._evict(now)
        total = len(self._events)
        rate = self._errors / total if total else 0.0

        def metric() -> Metric:
            if self.warming_up:
                return Metric(now, rate, None, None, self._errors, total, True)
            upper = self.mean + self.thresholds["LOW"] * self.std
            return Metric(now, rate, self.mean, upper, self._errors, total, False)

        if total < self.min_events:
            return metric(), None

        if self.warming_up:
            self._warmup_rates.append(rate)
            elapsed = now - self._first_ts if self._first_ts is not None else 0.0
            if elapsed >= self.warmup_sec and len(self._warmup_rates) >= 5:
                self.mean = statistics.fmean(self._warmup_rates)
                self.var = statistics.pvariance(self._warmup_rates)
            return metric(), None

        z = (rate - self.mean) / self.std
        sev = self._severity(z)
        if sev is None:
            self._update_baseline(rate)
            return metric(), None
        if not self._should_fire(now, sev):
            return metric(), None

        self._last_alert_ts, self._last_alert_sev = now, sev
        samples = [ln for _, e, ln in reversed(self._events) if e and ln][:5]
        alert = Alert(
            id=uuid.uuid4().hex[:12],
            timestamp=now,
            timestamp_iso=_iso(now),
            severity=sev,
            error_rate=round(rate, 4),
            baseline=round(self.mean, 4),
            baseline_std=round(self.std, 4),
            z_score=round(z, 2),
            errors=self._errors,
            total=total,
            window_sec=self.window_sec,
            sample_lines=samples,
        )
        return metric(), alert
