"""Follow a continuously growing log file, like `tail -F`.

Yields each new complete line. Yields None when there is no new data, so the
caller can still run periodic work (evaluating the window) while the file is quiet.
Handles the file not existing yet, truncation, and rotation (file replaced).
"""
import os
import threading
import time
from typing import Iterator, Optional


def _open(path: str):
    f = open(path, "r", encoding="utf-8", errors="replace")
    return f, os.fstat(f.fileno()).st_ino


def follow(
    path: str,
    poll_interval: float = 0.2,
    from_start: bool = False,
    stop_event: Optional[threading.Event] = None,
) -> Iterator[Optional[str]]:
    stop_event = stop_event or threading.Event()

    while not os.path.exists(path):
        if stop_event.is_set():
            return
        yield None
        time.sleep(poll_interval)

    f, inode = _open(path)
    if not from_start:
        f.seek(0, os.SEEK_END)
    partial = ""

    try:
        while not stop_event.is_set():
            chunk = f.readline()
            if chunk:
                partial += chunk
                if partial.endswith("\n"):
                    yield partial.rstrip("\r\n")
                    partial = ""
                continue

            try:
                st = os.stat(path)
            except FileNotFoundError:
                yield None
                time.sleep(poll_interval)
                continue

            rotated = st.st_ino != inode
            truncated = st.st_size < f.tell()
            if rotated or truncated:
                f.close()
                f, inode = _open(path)
                partial = ""
                continue

            yield None
            time.sleep(poll_interval)
    finally:
        f.close()
