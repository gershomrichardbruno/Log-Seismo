"""Send alerts to AWS CloudWatch Logs (every alert) and SNS (serious ones).

With AWS_ENABLED=false (default) it only prints, so the project runs
without an AWS account.
"""
import json
import logging

from config import settings
from detector.engine import SEVERITIES

log = logging.getLogger("aws")


class AlertPublisher:
    def __init__(self):
        self.enabled = settings.aws_enabled
        if not self.enabled:
            log.info("AWS disabled: alerts will be printed only (set AWS_ENABLED=true to send)")
            return
        import boto3

        self.logs = boto3.client("logs", region_name=settings.aws_region)
        self.sns = boto3.client("sns", region_name=settings.aws_region) if settings.sns_topic_arn else None
        self._ensure_stream()

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
        if not self.enabled:
            log.warning("[mock AWS] %s alert: rate %.1f%% vs baseline %.1f%%",
                        alert["severity"], alert["error_rate"] * 100, alert["baseline"] * 100)
            return
        try:
            self.logs.put_log_events(
                logGroupName=settings.cw_log_group,
                logStreamName=settings.cw_log_stream,
                logEvents=[{"timestamp": int(alert["timestamp"] * 1000), "message": json.dumps(alert)}],
            )
        except Exception:
            log.exception("CloudWatch put_log_events failed")

        if self.sns and SEVERITIES.index(alert["severity"]) >= SEVERITIES.index(settings.sns_min_severity):
            try:
                self.sns.publish(
                    TopicArn=settings.sns_topic_arn,
                    Subject=f"[{alert['severity']}] Log anomaly detected",
                    Message=(
                        f"Error rate {alert['error_rate']:.1%} vs baseline {alert['baseline']:.1%} "
                        f"(z={alert['z_score']}) at {alert['timestamp_iso']}\n\n"
                        + "\n".join(alert["sample_lines"])
                    ),
                )
            except Exception:
                log.exception("SNS publish failed")
