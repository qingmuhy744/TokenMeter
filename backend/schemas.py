from datetime import datetime
from pydantic import BaseModel, Field, field_validator


class PlanCreate(BaseModel):
    name: str
    api_type: str
    api_base: str
    api_key: str
    model: str
    prompt: str | None = None
    max_tokens: int = 256
    test_count: int = 3
    interval_minutes: int = 60
    is_active: bool = True


class PlanUpdate(BaseModel):
    name: str | None = None
    api_type: str | None = None
    api_base: str | None = None
    api_key: str | None = None
    model: str | None = None
    prompt: str | None = None
    max_tokens: int | None = None
    test_count: int | None = None
    interval_minutes: int | None = None
    is_active: bool | None = None


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


class PlanWithLatestResult(PlanResponse):
    latest_result: "TestResultResponse | None" = None


class TestResultResponse(BaseModel):
    id: int
    plan_id: int
    ttft_ms: float | None
    tps_overall: float | None
    tps_generate: float | None
    total_tokens: int | None
    total_time_ms: float | None
    error: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


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


class SettingsUpdate(BaseModel):
    default_prompt: str | None = None
    timeout_seconds: int | None = None


class PaginatedResponse(BaseModel):
    items: list[TestResultResponse]
    total: int
    page: int
    size: int
