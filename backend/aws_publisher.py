"""Send alerts to AWS CloudWatch Logs (every alert) and SNS (serious ones).

Publishing runs on its own worker thread behind a queue, so a slow AWS call
never delays detection or the dashboard.

With AWS_ENABLED=false (default) it only prints, so the project runs
without an AWS account.
"""
import json
import logging
import queue
import threading

from config import settings
from detector.engine import SEVERITIES

log = logging.getLogger("aws")


class AlertPublisher:
    def __init__(self):
        self.enabled = settings.aws_enabled
        self.sent = 0
        self.failed = 0
        self._q: queue.Queue = queue.Queue(maxsize=1000)
        if not self.enabled:
            log.info("AWS disabled: alerts will be printed only (set AWS_ENABLED=true to send)")
            return
        import boto3

        self.logs = boto3.client("logs", region_name=settings.aws_region)
        self.sns = boto3.client("sns", region_name=settings.aws_region) if settings.sns_topic_arn else None
        self._ensure_stream()
        threading.Thread(target=self._worker, name="aws-publisher", daemon=True).start()

    def _ensure_stream(self) -> None:
        for call, kwargs in (
            (self.logs.create_log_group, {"logGroupName": settings.cw_log_group}),
            (self.logs.create_log_stream, {"logGroupName": settings.cw_log_group,
                                           "logStreamName": settings.cw_log_stream}),
        ):
            try:
                call(**kwargs)
            except self.logs.exceptions.ResourceAlreadyExistsException:
                pass

    def publish(self, alert: dict) -> None:
        """Queue an alert for delivery. Returns immediately."""
        if not self.enabled:
            log.warning("[mock AWS] %s %s: %s", alert["severity"], alert.get("kind", "anomaly"), alert.get("message", ""))
            return
        try:
            self._q.put_nowait(alert)
        except queue.Full:
            self.failed += 1
            log.error("AWS publish queue full, dropping alert %s", alert["id"])

    def _worker(self) -> None:
        while True:
            self._send(self._q.get())

    def _send(self, alert: dict) -> None:
        try:
            self.logs.put_log_events(
                logGroupName=settings.cw_log_group,
                logStreamName=settings.cw_log_stream,
                logEvents=[{"timestamp": int(alert["timestamp"] * 1000), "message": json.dumps(alert)}],
            )
            self.sent += 1
        except Exception:
            self.failed += 1
            log.exception("CloudWatch put_log_events failed")

        # For a recovery, severity is the incident's peak, so a HIGH incident's recovery is also sent.
        if self.sns and SEVERITIES.index(alert["severity"]) >= SEVERITIES.index(settings.sns_min_severity):
            recovery = alert.get("kind") == "recovery"
            try:
                self.sns.publish(
                    TopicArn=settings.sns_topic_arn,
                    Subject=(f"[RESOLVED] {alert['severity']} log anomaly" if recovery
                             else f"[{alert['severity']}] Log anomaly detected"),
                    Message=(
                        f"{alert.get('message', '')}\nAt {alert['timestamp_iso']}\n\n"
                        + "\n".join(alert["sample_lines"])
                    ),
                )
            except Exception:
                self.failed += 1
                log.exception("SNS publish failed")
