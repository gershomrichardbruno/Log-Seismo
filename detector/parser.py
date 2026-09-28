"""Turn a raw log line into {ts, level, msg}."""
import re
from datetime import datetime
from typing import Optional

LEVELS = ("DEBUG", "INFO", "WARN", "WARNING", "ERROR", "CRITICAL", "FATAL")
ERROR_LEVELS = frozenset({"ERROR", "CRITICAL", "FATAL"})

_LINE_RE = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)\s+"
    r"(?P<level>[A-Z]+)\s+(?P<msg>.*)$"
)
_LEVEL_ANYWHERE = re.compile(r"\b(" + "|".join(LEVELS) + r")\b")


def parse_line(line: str) -> Optional[dict]:
    line = line.strip()
    if not line:
        return None
    m = _LINE_RE.match(line)
    if m and m["level"] in LEVELS:
        return {"ts": m["ts"], "level": m["level"], "msg": m["msg"]}
    # Fallback for other formats: find a level keyword anywhere in the line.
    m = _LEVEL_ANYWHERE.search(line)
    if m:
        return {"ts": None, "level": m.group(1), "msg": line}
    return None


def to_epoch(ts: Optional[str]) -> Optional[float]:
    """'2026-09-28 10:00:03,120' (local time) -> epoch seconds, or None if unparseable."""
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace(",", ".").replace("T", " ")).timestamp()
    except ValueError:
        return None
