"""The tailer follows a continuously growing file, including truncation and rotation."""
import os
import sys
import threading
import time

import pytest

from detector.tailer import follow


class Collector:
    def __init__(self, path):
        self.lines, self.stop = [], threading.Event()
        self.t = threading.Thread(target=self._run, args=(path,), daemon=True)
        self.t.start()
        time.sleep(0.3)  # let it open the file and seek to the end

    def _run(self, path):
        for line in follow(path, poll_interval=0.02, stop_event=self.stop):
            if line is not None:
                self.lines.append(line)

    def wait_for(self, n, timeout=3.0):
        end = time.time() + timeout
        while len(self.lines) < n and time.time() < end:
            time.sleep(0.02)
        return self.lines

    def close(self):
        self.stop.set()
        self.t.join(2)


def append(path, *lines):
    with open(path, "a", encoding="utf-8") as f:
        for ln in lines:
            f.write(ln + "\n")


def test_follows_new_lines_only(tmp_path):
    p = tmp_path / "app.log"
    append(p, "old line that existed before")
    c = Collector(str(p))
    append(p, "2026-09-28 10:00:00,000 INFO a", "2026-09-28 10:00:01,000 ERROR b")
    assert c.wait_for(2) == ["2026-09-28 10:00:00,000 INFO a", "2026-09-28 10:00:01,000 ERROR b"]
    c.close()


def test_partial_line_waits_for_newline(tmp_path):
    p = tmp_path / "app.log"
    p.write_text("")
    c = Collector(str(p))
    with open(p, "a", encoding="utf-8") as f:
        f.write("2026-09-28 10:00:00,000 ERROR half")
        f.flush()
        time.sleep(0.2)
        assert c.lines == []
        f.write(" and the rest\n")
    assert c.wait_for(1) == ["2026-09-28 10:00:00,000 ERROR half and the rest"]
    c.close()


def test_survives_truncation(tmp_path):
    p = tmp_path / "app.log"
    append(p, "x" * 200)
    c = Collector(str(p))
    append(p, "before truncate")
    c.wait_for(1)
    with open(p, "w", encoding="utf-8"):
        pass  # truncate, like `> app.log` or copytruncate rotation
    time.sleep(0.2)
    append(p, "after truncate")
    assert c.wait_for(2)[-1] == "after truncate"
    c.close()


def test_waits_for_file_to_appear(tmp_path):
    p = tmp_path / "later.log"
    c = Collector(str(p))
    p.write_text("")
    time.sleep(0.2)
    append(p, "first line")
    assert c.wait_for(1) == ["first line"]
    c.close()


@pytest.mark.skipif(sys.platform == "win32", reason="Windows cannot rename a file that is open for reading")
def test_survives_rotation(tmp_path):
    p = tmp_path / "app.log"
    p.write_text("")
    c = Collector(str(p))
    append(p, "in old file")
    c.wait_for(1)
    os.replace(p, tmp_path / "app.log.1")  # logrotate-style: move away, start a new file
    append(p, "in new file")
    assert c.wait_for(2)[-1] == "in new file"
    c.close()
