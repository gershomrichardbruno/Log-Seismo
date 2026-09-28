"""Check the AWS wiring in one command, before the demo.

Sends one test event to CloudWatch Logs and one test SNS message, using the same
settings as the app (.env). Prints what worked and how to fix what didn't.

    python -m scripts.aws_check
"""
import json
import sys
import time

from config import settings


def main() -> int:
    try:
        import boto3
        from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
    except ImportError:
        print("boto3 is not installed: pip install -r requirements.txt")
        return 1

    print(f"Region: {settings.aws_region}")
    ok = True

    try:
        who = boto3.client("sts", region_name=settings.aws_region).get_caller_identity()
        print(f"[ok]   credentials work: {who['Arn']}")
    except NoCredentialsError:
        print("[fail] no AWS credentials found. Put AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env")
        return 1
    except (ClientError, BotoCoreError) as e:
        print(f"[fail] credentials rejected: {e}\n       Check the two keys in .env (no spaces or quotes).")
        return 1

    logs = boto3.client("logs", region_name=settings.aws_region)
    try:
        for call, kwargs in (
            (logs.create_log_group, {"logGroupName": settings.cw_log_group}),
            (logs.create_log_stream, {"logGroupName": settings.cw_log_group, "logStreamName": settings.cw_log_stream}),
        ):
            try:
                call(**kwargs)
            except logs.exceptions.ResourceAlreadyExistsException:
                pass
        logs.put_log_events(
            logGroupName=settings.cw_log_group,
            logStreamName=settings.cw_log_stream,
            logEvents=[{"timestamp": int(time.time() * 1000),
                        "message": json.dumps({"kind": "test", "message": "Log-Seismo AWS check"})}],
        )
        print(f"[ok]   CloudWatch Logs: wrote a test event to {settings.cw_log_group}")
    except (ClientError, BotoCoreError) as e:
        ok = False
        print(f"[fail] CloudWatch Logs: {e}\n       The IAM user needs logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents.")

    if not settings.sns_topic_arn:
        ok = False
        print("[fail] SNS: SNS_TOPIC_ARN is empty in .env")
    else:
        try:
            boto3.client("sns", region_name=settings.aws_region).publish(
                TopicArn=settings.sns_topic_arn,
                Subject="[TEST] Log-Seismo AWS check",
                Message="If you can read this, SNS alerts from Log-Seismo will reach you.",
            )
            print("[ok]   SNS: test message published. Check your inbox (and spam).")
        except (ClientError, BotoCoreError) as e:
            ok = False
            print(f"[fail] SNS: {e}\n       Check the topic ARN, its region, and the sns:Publish permission.")

    if not settings.aws_enabled:
        print("\nNote: AWS_ENABLED is false, so the app itself will not publish yet. Set AWS_ENABLED=true in .env.")
    print("\nAll good." if ok else "\nFix the [fail] lines above and run this again.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
