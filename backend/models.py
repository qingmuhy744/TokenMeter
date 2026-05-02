from datetime import datetime, timezone

from sqlalchemy import Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


class TokenPlan(Base):
    __tablename__ = "token_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    api_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    api_base: Mapped[str | None] = mapped_column(String(500), nullable=True)
    api_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    max_tokens: Mapped[int] = mapped_column(Integer, default=256)
    test_count: Mapped[int] = mapped_column(Integer, default=3)
    interval_minutes: Mapped[int] = mapped_column(Integer, default=60)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("token_plans.id"), nullable=True
    )
    multiplier: Mapped[float] = mapped_column(Float, default=1.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    results: Mapped[list["TestResult"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan"
    )
    parent: Mapped["TokenPlan | None"] = relationship(
        "TokenPlan", remote_side=[id], back_populates="children"
    )
    children: Mapped[list["TokenPlan"]] = relationship(
        "TokenPlan", back_populates="parent", cascade="all, delete-orphan"
    )


class TestResult(Base):
    __tablename__ = "test_results"
    __test__ = False  # Prevent pytest from collecting this as a test class

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("token_plans.id"), nullable=False
    )
    ttft_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    tps_overall: Mapped[float | None] = mapped_column(Float, nullable=True)
    tps_generate: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cache_read: Mapped[int | None] = mapped_column(Integer, nullable=True)
    char_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    token_density: Mapped[float | None] = mapped_column(Float, nullable=True)
    ttfb_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    ttfr_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    think_time_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    content_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    thinking_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tps_content: Mapped[float | None] = mapped_column(Float, nullable=True)
    content_char_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    thinking_char_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ping_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    ping_samples: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    debug_chunks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    plan: Mapped["TokenPlan"] = relationship(back_populates="results")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
