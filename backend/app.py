"""FastAPI server: runs the detector in a background thread and streams
metrics + alerts to the browser over WebSocket (REST endpoints = polling fallback).

    uvicorn backend.app:app --reload
"""
import asyncio
import logging
import threading
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from config import settings
from detector.pipeline import run_pipeline
from .aws_publisher import AlertPublisher

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")


class Hub:
    """Keeps recent history and fans messages out to every connected browser."""

    def __init__(self):
        self.clients: set[WebSocket] = set()
        self.alerts: deque = deque(maxlen=200)
        self.metrics: deque = deque(maxlen=600)

    async def push(self, kind: str, data: dict) -> None:
        (self.alerts if kind == "alert" else self.metrics).append(data)
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_json({"type": kind, "data": data})
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)


hub = Hub()
publisher: AlertPublisher | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global publisher
    loop = asyncio.get_running_loop()
    stop = threading.Event()
    publisher = AlertPublisher()

    def on_metric(m):
        asyncio.run_coroutine_threadsafe(hub.push("metric", m.to_dict()), loop)

    def on_alert(a):
        d = a.to_dict()
        log.info("ALERT %s %s: %s", d["kind"], d["severity"], d["message"])
        publisher.publish(d)
        asyncio.run_coroutine_threadsafe(hub.push("alert", d), loop)

    t = threading.Thread(target=run_pipeline, args=(settings.log_path, on_metric, on_alert, stop), daemon=True)
    t.start()
    log.info("Watching %s", settings.log_path)
    yield
    stop.set()


app = FastAPI(title="Log Anomaly Detector", lifespan=lifespan)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "log_path": settings.log_path,
        "aws_enabled": bool(publisher and publisher.enabled),
        "aws_sent": publisher.sent if publisher else 0,
        "aws_failed": publisher.failed if publisher else 0,
        "clients": len(hub.clients),
        "window_sec": settings.window_sec,
        "sns_enabled": bool(publisher and publisher.enabled and publisher.sns),
        "sns_min_severity": settings.sns_min_severity,
    }


@app.get("/api/alerts")
def get_alerts(since: float = 0):
    return [a for a in hub.alerts if a["timestamp"] > since]


@app.get("/api/metrics")
def get_metrics(since: float = 0):
    return [m for m in hub.metrics if m["timestamp"] > since]


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    await ws.send_json({"type": "snapshot", "data": {"alerts": list(hub.alerts), "metrics": list(hub.metrics)}})
    hub.clients.add(ws)
    try:
        while True:
            await ws.receive_text()  # keeps the connection open; client messages ignored
    except WebSocketDisconnect:
        pass
    finally:
        hub.clients.discard(ws)


# Serve the built React app (npm run build in frontend/). In development, run `npm run dev`
# in frontend/ instead; Vite proxies /api and /ws to this server.
_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
else:
    log.warning("frontend/dist not found: run `npm install && npm run build` in frontend/ to serve the dashboard")
