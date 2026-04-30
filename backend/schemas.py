from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlparse
import ipaddress

from pydantic import BaseModel, Field, field_validator, field_serializer


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
    if hostname in ("localhost", "127.0.0.1", "0.0.0.0", "[::1]"):
        raise ValueError("api_base cannot point to localhost")
    return url


class PlanCreate(BaseModel):
    name: str
    api_type: Literal["openai", "anthropic"]
    api_base: str
    api_key: str
    model: str
    prompt: str | None = None
    max_tokens: int = 256
    test_count: int = 3
    interval_minutes: int = 60
    is_active: bool = True

    @field_validator("api_base")
    @classmethod
    def validate_api_base(cls, v: str) -> str:
        return _validate_api_base(v)


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

    @field_validator("api_base")
    @classmethod
    def validate_api_base(cls, v: str | None) -> str | None:
        if v is not None:
            return _validate_api_base(v)
        return v


class PlanResponse(BaseModel):
    id: int
    name: str
    api_type: str
    api_base: str
    api_key: str
    model: str
    prompt: str | None
    max_tokens: int
    test_count: int
    interval_minutes: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("api_key")
    @classmethod
    def mask_api_key(cls, v: str) -> str:
        if len(v) <= 8:
            return "****"
        return f"{v[:4]}...{v[-4:]}"

    @field_serializer("created_at", "updated_at")
    @classmethod
    def serialize_dt(cls, v: datetime) -> datetime:
        return _ensure_utc(v)


class PlanWithLatestResult(PlanResponse):
    latest_result: "TestResultResponse | None" = None


class TestResultResponse(BaseModel):
    id: int
    plan_id: int
    plan_name: str | None = None
    ttft_ms: float | None
    tps_overall: float | None
    tps_generate: float | None
    total_tokens: int | None
    total_time_ms: float | None
    error: str | None
    note: str | None = None
    debug_chunks: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("created_at")
    @classmethod
    def serialize_dt(cls, v: datetime) -> datetime:
        return _ensure_utc(v)


class StatsResponse(BaseModel):
    plan_id: int
    count: int
    avg_ttft_ms: float | None
    avg_tps_overall: float | None
    avg_tps_generate: float | None
    median_ttft_ms: float | None
    median_tps_overall: float | None
    p95_ttft_ms: float | None


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8)


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
