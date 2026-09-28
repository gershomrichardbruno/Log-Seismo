"""Sliding-window error rate, learned baseline, and anomaly scoring.

How it works
------------
1. Every log event goes into a time-based sliding window (default 60 s).
2. Once per tick we compute error_rate = errors / total inside the window.
3. Warm-up: for the first `warmup_sec` we only collect rates, then set the
   baseline from their median and MAD (robust to a burst during warm-up).
4. After warm-up, z = (rate - mean) / std. A z above a threshold is an anomaly,
   and the size of z decides severity.
5. The baseline keeps adapting (EWMA) but only from clearly normal ticks
   (z below `adapt_max_z`), so an ongoing incident, or the elevated ramp before
   and after one, does not become the "new normal".
6. A cooldown stops repeat alerts, but an escalation (e.g. MEDIUM -> HIGH)
   always fires.
7. Once the rate stays normal for `recovery_ticks` ticks after an incident, a
   single recovery alert (kind="recovery") closes the incident.
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
    kind: str  # "anomaly" or "recovery"
    timestamp: float
    timestamp_iso: str
    severity: str  # for a recovery: the peak severity of the incident it closes
    message: str
    error_rate: float
    baseline: float
    baseline_std: float
    z_score: float
    errors: int
    total: int
    window_sec: int
    sample_lines: list
    detection_lag_ms: Optional[float] = None  # newest error line written -> alert raised
    incident_id: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


class AnomalyDetector:
    def __init__(
        self,
        window_sec: int = 60,
        warmup_sec: int = 60,
        min_events: int = 20,
        cooldown_sec: int = 30,
        ewma_alpha: float = 0.02,
        std_floor: float = 0.01,
        thresholds: Optional[dict] = None,
        recovery_ticks: int = 5,
        adapt_max_z: float = 2.0,
    ):
        self.window_sec = window_sec
        self.warmup_sec = warmup_sec
        self.min_events = min_events
        self.cooldown_sec = cooldown_sec
        self.alpha = ewma_alpha
        self.std_floor = std_floor
        self.thresholds = thresholds or dict(DEFAULT_THRESHOLDS)
        self.recovery_ticks = recovery_ticks
        self.adapt_max_z = adapt_max_z

        self._events: deque = deque()  # (ts, is_error, line)
        self._errors = 0
        self._first_ts: Optional[float] = None
        self._warmup_rates: list = []
        self.mean: Optional[float] = None
        self.var: Optional[float] = None
        self._last_alert_ts: Optional[float] = None
        self._last_alert_sev: Optional[str] = None
        self._last_error_log_ts: Optional[float] = None
        # open incident: id, start time, peak severity, consecutive normal ticks
        self._incident: Optional[dict] = None

    # ---- input -------------------------------------------------------------
    def add(self, ts: float, level: str, line: str = "", log_ts: Optional[float] = None) -> None:
        """`ts` is when the line was seen; `log_ts` is the timestamp written in the line, if known."""
        if self._first_ts is None:
            self._first_ts = ts
        is_err = level.upper() in ERROR_LEVELS
        self._events.append((ts, is_err, line))
        if is_err:
            self._errors += 1
            self._last_error_log_ts = log_ts if log_ts is not None else ts

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
                # Median + MAD rather than mean + variance, so an incident that happens
                # to overlap warm-up does not become the learned "normal".
                med = statistics.median(self._warmup_rates)
                mad = statistics.median(abs(r - med) for r in self._warmup_rates)
                self.mean = med
                self.var = (1.4826 * mad) ** 2
            return metric(), None

        z = (rate - self.mean) / self.std
        sev = self._severity(z)
        if sev is None:
            if z < self.adapt_max_z:
                self._update_baseline(rate)
            return metric(), self._maybe_recover(now, rate, total)
        if self._incident is not None:
            self._incident["normal_ticks"] = 0
        if not self._should_fire(now, sev):
            return metric(), None

        if self._incident is None:
            self._incident = {"id": uuid.uuid4().hex[:12], "start": now, "peak": sev, "normal_ticks": 0}
        elif SEVERITIES.index(sev) > SEVERITIES.index(self._incident["peak"]):
            self._incident["peak"] = sev

        self._last_alert_ts, self._last_alert_sev = now, sev
        samples = [ln for _, e, ln in reversed(self._events) if e and ln][:5]
        lag = None
        if self._last_error_log_ts is not None:
            lag = round(max(0.0, now - self._last_error_log_ts) * 1000, 1)
        alert = Alert(
            id=uuid.uuid4().hex[:12],
            kind="anomaly",
            timestamp=now,
            timestamp_iso=_iso(now),
            severity=sev,
            message=(
                f"Error rate {rate:.1%} vs normal {self.mean:.1%} "
                f"({self._errors} errors in {total} lines over the last {self.window_sec}s, "
                f"{z:.1f} std devs above baseline)"
            ),
            error_rate=round(rate, 4),
            baseline=round(self.mean, 4),
            baseline_std=round(self.std, 4),
            z_score=round(z, 2),
            errors=self._errors,
            total=total,
            window_sec=self.window_sec,
            sample_lines=samples,
            detection_lag_ms=lag,
            incident_id=self._incident["id"],
        )
        return metric(), alert

    def _maybe_recover(self, now: float, rate: float, total: int) -> Optional[Alert]:
        inc = self._incident
        if inc is None:
            return None
        inc["normal_ticks"] += 1
        if inc["normal_ticks"] < self.recovery_ticks:
            return None
        self._incident = None
        self._last_alert_ts = self._last_alert_sev = None
        duration = now - inc["start"]
        return Alert(
            id=uuid.uuid4().hex[:12],
            kind="recovery",
            timestamp=now,
            timestamp_iso=_iso(now),
            severity=inc["peak"],
            message=(
                f"Recovered: error rate back to {rate:.1%} (normal {self.mean:.1%}) "
                f"after a {inc['peak']} incident lasting {duration:.0f}s"
            ),
            error_rate=round(rate, 4),
            baseline=round(self.mean, 4),
            baseline_std=round(self.std, 4),
            z_score=round((rate - self.mean) / self.std, 2),
            errors=self._errors,
            total=total,
            window_sec=self.window_sec,
            sample_lines=[],
            incident_id=inc["id"],
        )
