from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlparse
import ipaddress

from pydantic import BaseModel, Field, field_validator, field_serializer, SecretStr


def _ensure_utc(dt: datetime) -> datetime:
    """Ensure datetime has UTC timezone info (treat naive as UTC)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _validate_api_base(url: str) -> str:
    """Validate api_base URL to prevent SSRF attacks."""
    parsed = urlparse(url)
    if parsed.scheme not in ("https", "http"):
        raise ValueError("api_base must use http or https scheme")
    hostname = parsed.hostname or ""
    # Block private/internal IP ranges
    try:
        ip = ipaddress.ip_address(hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError("api_base cannot point to private/internal addresses")
    except ValueError as e:
        if (
            "private" in str(e)
            or "loopback" in str(e)
            or "link_local" in str(e)
            or "reserved" in str(e)
        ):
            raise
        # Not an IP address (hostname like "api.openai.com") — that's fine
    # Block common internal hostnames
    if hostname in ("localhost", "127.0.0.1", "0.0.0.0", "[::1]"):  # nosec
        raise ValueError("api_base cannot point to localhost")
    return url


class PlanCreate(BaseModel):
    name: str
    api_type: Literal["openai", "anthropic"] | None = None
    api_base: str | None = None
    api_key: str | None = None
    model: str | None = None
    prompt: str | None = None
    max_tokens: int | None = None
    test_count: int | None = None
    interval_minutes: int = 60
    is_active: bool = True
    parent_id: int | None = None
    multiplier: float = Field(default=1.0, gt=0, le=1)

    @field_validator("api_base")
    @classmethod
    def validate_api_base(cls, v: str | None) -> str | None:
        if v is not None and v.strip() != "":
            return _validate_api_base(v)
        return None  # Treat empty string as None to support inheritance


class PlanUpdate(BaseModel):
    name: str | None = None
    api_type: Literal["openai", "anthropic"] | None = None
    api_base: str | None = None
    api_key: str | None = None
    model: str | None = None
    prompt: str | None = None
    max_tokens: int | None = None
    test_count: int | None = None
    interval_minutes: int | None = None
    is_active: bool | None = None
    parent_id: int | None = None
    multiplier: float | None = Field(default=None, gt=0, le=1)

    @field_validator("api_base")
    @classmethod
    def validate_api_base(cls, v: str | None) -> str | None:
        if v is not None and v.strip() != "":
            return _validate_api_base(v)
        return None  # Treat empty string as None to support inheritance


class PlanResponse(BaseModel):
    id: int
    name: str
    api_type: str | None
    api_base: str | None
    has_api_key: bool = False
    model: str | None
    prompt: str | None
    max_tokens: int | None
    test_count: int | None
    interval_minutes: int
    is_active: bool
    parent_id: int | None = None
    multiplier: float = 1.0
    created_at: datetime
    updated_at: datetime

    effective_api_type: str | None = None
    effective_api_base: str | None = None
    has_effective_api_key: bool = False
    effective_model: str | None = None
    effective_prompt: str | None = None
    effective_max_tokens: int | None = None
    effective_test_count: int | None = None

    model_config = {"from_attributes": True}

    @field_serializer("created_at", "updated_at")
    @classmethod
    def serialize_dt(cls, v: datetime) -> datetime:
        return _ensure_utc(v)


class TestResultResponse(BaseModel):
    id: int
    plan_id: int
    plan_name: str | None = None
    ttft_ms: float | None
    tps_overall: float | None
    tps_generate: float | None
    total_tokens: int | None
    total_time_ms: float | None
    input_tokens: int | None = None
    cache_read: int | None = None
    char_count: int | None = None
    token_density: float | None = None
    ttfb_ms: float | None = None
    ttfr_ms: float | None = None
    think_time_ms: float | None = None
    content_tokens: int | None = None
    thinking_tokens: int | None = None
    tps_content: float | None = None
    content_char_count: int | None = None
    thinking_char_count: int | None = None
    ping_ms: float | None = None
    ping_samples: str | None = None  # JSON array as string
    error: str | None
    note: str | None = None
    debug_chunks: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("created_at")
    @classmethod
    def serialize_dt(cls, v: datetime) -> datetime:
        return _ensure_utc(v)


class PublicTestResultResponse(BaseModel):
    """脱敏后的测试结果，供游客查看"""

    id: int
    plan_id: int
    plan_name: str | None = None
    ttft_ms: float | None
    tps_overall: float | None
    tps_generate: float | None
    total_tokens: int | None
    total_time_ms: float | None
    ttfb_ms: float | None = None
    ttfr_ms: float | None = None
    think_time_ms: float | None = None
    tps_content: float | None = None
    thinking_tokens: int | None = None
    ping_ms: float | None = None
    error: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("created_at")
    @classmethod
    def serialize_dt(cls, v: datetime) -> datetime:
        return _ensure_utc(v)


class PublicPaginatedResponse(BaseModel):
    items: list[PublicTestResultResponse]
    total: int
    page: int
    size: int


class StatsResponse(BaseModel):
    plan_id: int
    count: int
    avg_ttft_ms: float | None
    avg_tps_overall: float | None
    avg_tps_generate: float | None
    median_ttft_ms: float | None
    median_tps_overall: float | None
    p95_ttft_ms: float | None


class MatrixItem(BaseModel):
    plan_id: int
    full_name: str
    latest_status: Literal["success", "error", "none"]
    sparkline: list[float | None]
    avg_ttft: float | None
    avg_tps_overall: float | None
    avg_tps_generate: float | None
    day_avg_ttft: float | None
    night_avg_ttft: float | None
    degradation: float | None
    success_rate: float | None


class LoginRequest(BaseModel):
    username: str
    password: SecretStr


class ChangePasswordRequest(BaseModel):
    old_password: SecretStr
    new_password: SecretStr = Field(min_length=8)


class SettingsResponse(BaseModel):
    default_prompt: str
    timeout_seconds: int
    custom_banner: str | None = None


class SettingsUpdate(BaseModel):
    default_prompt: str | None = None
    timeout_seconds: int | None = None
    custom_banner: str | None = None


class PaginatedResponse(BaseModel):
    items: list[TestResultResponse]
    total: int
    page: int
    size: int
