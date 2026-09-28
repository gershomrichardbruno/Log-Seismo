"""REST polling endpoints and the WebSocket snapshot the dashboard relies on."""
from fastapi.testclient import TestClient

from backend.app import app, hub

client = TestClient(app)  # used without `with`, so the log-tailing thread is not started


def setup_function():
    hub.alerts.clear()
    hub.metrics.clear()
    hub.alerts.extend([{"id": "a1", "timestamp": 100.0, "severity": "LOW"},
                       {"id": "a2", "timestamp": 200.0, "severity": "HIGH"}])
    hub.metrics.extend([{"timestamp": 150.0, "error_rate": 0.03},
                        {"timestamp": 250.0, "error_rate": 0.30}])


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and "window_sec" in body and "aws_enabled" in body


def test_polling_returns_only_newer_items():
    assert [a["id"] for a in client.get("/api/alerts", params={"since": 150}).json()] == ["a2"]
    assert [m["timestamp"] for m in client.get("/api/metrics", params={"since": 0}).json()] == [150.0, 250.0]


def test_websocket_sends_snapshot_on_connect():
    with client.websocket_connect("/ws") as ws:
        msg = ws.receive_json()
    assert msg["type"] == "snapshot"
    assert [a["id"] for a in msg["data"]["alerts"]] == ["a1", "a2"]
    assert len(msg["data"]["metrics"]) == 2
