"""Central settings, read from environment variables (or a .env file)."""
import os
from dataclasses import dataclass

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    log_path: str = os.getenv("LOG_PATH", "logs/app.log")
    window_sec: int = int(os.getenv("WINDOW_SEC", "60"))
    warmup_sec: int = int(os.getenv("WARMUP_SEC", "60"))
    tick_sec: float = float(os.getenv("TICK_SEC", "1"))
    min_events: int = int(os.getenv("MIN_EVENTS", "20"))
    cooldown_sec: int = int(os.getenv("COOLDOWN_SEC", "30"))
    ewma_alpha: float = float(os.getenv("EWMA_ALPHA", "0.02"))
    adapt_max_z: float = float(os.getenv("ADAPT_MAX_Z", "2.0"))
    recovery_ticks: int = int(os.getenv("RECOVERY_TICKS", "5"))

    aws_enabled: bool = _bool("AWS_ENABLED", False)
    aws_region: str = os.getenv("AWS_REGION", "ap-south-1")
    cw_log_group: str = os.getenv("CW_LOG_GROUP", "/log-anomaly-detector/alerts")
    cw_log_stream: str = os.getenv("CW_LOG_STREAM", "alerts")
    sns_topic_arn: str = os.getenv("SNS_TOPIC_ARN", "")
    sns_min_severity: str = os.getenv("SNS_MIN_SEVERITY", "HIGH")


settings = Settings()
