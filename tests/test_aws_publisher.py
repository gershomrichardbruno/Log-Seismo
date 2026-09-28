"""The AWS publisher sends the right CloudWatch Logs and SNS calls.

Uses botocore's Stubber (AWS's offline test harness): every expected API call and
its exact parameters are asserted, and nothing goes over the network.
"""
import dataclasses
import json

import boto3
from botocore.stub import ANY, Stubber

import backend.aws_publisher as aws_publisher
from backend.aws_publisher import AlertPublisher
from config import settings as real_settings

TOPIC = "arn:aws:sns:ap-south-1:123456789012:log-seismo-alerts"


def alert(severity="HIGH", kind="anomaly"):
    return {
        "id": "abc123", "kind": kind, "timestamp": 1790580172.4,
        "timestamp_iso": "2026-09-28T10:02:52.400000+00:00", "severity": severity,
        "message": "Error rate 34.2% vs normal 3.1%", "error_rate": 0.342, "baseline": 0.031,
        "baseline_std": 0.01, "z_score": 31.7, "errors": 410, "total": 1198, "window_sec": 60,
        "sample_lines": ["2026-09-28 10:02:51,882 ERROR DB connection timeout"],
        "detection_lag_ms": 120.0, "incident_id": "inc1",
    }


# Test settings, independent of anyone's local .env
settings = dataclasses.replace(real_settings, aws_enabled=False, sns_topic_arn=TOPIC, sns_min_severity="HIGH")


def make_publisher(monkeypatch):
    monkeypatch.setattr(aws_publisher, "settings", settings)
    pub = AlertPublisher()  # AWS disabled: no real clients, no worker thread
    kw = dict(region_name="ap-south-1", aws_access_key_id="test", aws_secret_access_key="test")
    pub.logs = boto3.client("logs", **kw)
    pub.sns = boto3.client("sns", **kw)
    return pub, Stubber(pub.logs), Stubber(pub.sns)


def test_high_alert_goes_to_cloudwatch_and_sns(monkeypatch):
    pub, logs, sns = make_publisher(monkeypatch)
    a = alert("HIGH")
    logs.add_response("put_log_events", {}, {
        "logGroupName": settings.cw_log_group,
        "logStreamName": settings.cw_log_stream,
        "logEvents": [{"timestamp": int(a["timestamp"] * 1000), "message": json.dumps(a)}],
    })
    sns.add_response("publish", {"MessageId": "m1"}, {
        "TopicArn": TOPIC, "Subject": "[HIGH] Log anomaly detected", "Message": ANY,
    })
    with logs, sns:
        pub._send(a)
    logs.assert_no_pending_responses()
    sns.assert_no_pending_responses()
    assert pub.sent == 1 and pub.failed == 0


def test_low_alert_goes_to_cloudwatch_only(monkeypatch):
    pub, logs, sns = make_publisher(monkeypatch)
    logs.add_response("put_log_events", {}, None)
    with logs, sns:  # no SNS response queued: any publish call would raise
        pub._send(alert("LOW"))
    logs.assert_no_pending_responses()


def test_recovery_of_high_incident_is_emailed_as_resolved(monkeypatch):
    pub, logs, sns = make_publisher(monkeypatch)
    logs.add_response("put_log_events", {}, None)
    sns.add_response("publish", {"MessageId": "m2"}, {
        "TopicArn": TOPIC, "Subject": "[RESOLVED] CRITICAL log anomaly", "Message": ANY,
    })
    with logs, sns:
        pub._send(alert("CRITICAL", kind="recovery"))
    sns.assert_no_pending_responses()


def test_aws_errors_are_counted_not_raised(monkeypatch):
    pub, logs, sns = make_publisher(monkeypatch)
    logs.add_client_error("put_log_events", "AccessDeniedException")
    sns.add_client_error("publish", "AuthorizationError")
    with logs, sns:
        pub._send(alert("CRITICAL"))  # must not raise: detection keeps running
    assert pub.failed == 2


def test_unreachable_aws_falls_back_instead_of_crashing(monkeypatch):
    # AWS enabled but no usable credentials: the app must still start.
    monkeypatch.setattr(aws_publisher, "settings", dataclasses.replace(settings, aws_enabled=True))
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "")
    monkeypatch.setenv("AWS_SHARED_CREDENTIALS_FILE", "/nonexistent")
    monkeypatch.setenv("AWS_CONFIG_FILE", "/nonexistent")
    monkeypatch.setenv("AWS_EC2_METADATA_DISABLED", "true")
    pub = AlertPublisher()
    assert pub.enabled is False
    pub.publish(alert("CRITICAL"))  # prints instead of raising
