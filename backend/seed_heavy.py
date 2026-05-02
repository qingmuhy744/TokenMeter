"""
Seed heavy fake data for development/testing the Matrix Dashboard and History performance.
Run with: uv run python -m backend.seed_heavy
"""

import asyncio
import random
from datetime import datetime, timezone, timedelta

from sqlalchemy import select
from backend.database import async_session
from backend.models import TokenPlan, TestResult


async def seed_heavy_data(days: int = 7, plans_count: int = 15):
    async with async_session() as db:
        # 1. Create a set of diverse plans (Suites and Models)
        providers = [
            ("OpenAI", "openai", "https://api.openai.com/v1"),
            ("Anthropic", "anthropic", "https://api.anthropic.com/v1"),
            ("DeepSeek", "openai", "https://api.deepseek.com/v1"),
            ("SiliconFlow", "openai", "https://api.siliconflow.cn/v1"),
            ("Groq", "openai", "https://api.groq.com/openai/v1"),
            ("Mistral", "openai", "https://api.mistral.ai/v1"),
        ]

        # Check existing plans to avoid duplicates or just add to them
        res = await db.execute(select(TokenPlan).where(TokenPlan.parent_id.is_(None)))
        existing_suites = res.scalars().all()

        suites = []
        if not existing_suites:
            print(f"Creating {len(providers)} suites...")
            for name, api_type, base in providers:
                suite = TokenPlan(
                    name=name,
                    api_type=api_type,
                    api_base=base,
                    api_key=f"fake-key-{name.lower()}",
                    is_active=True,
                )
                db.add(suite)
                suites.append(suite)
            await db.flush()
        else:
            suites = existing_suites

        # 2. Create models for each suite
        models_to_test = []
        for suite in suites:
            # Create 2-4 models per suite
            num_models = random.randint(2, 4)
            for i in range(num_models):
                model_name = f"{suite.name}-Model-{i + 1}"
                # Check if model exists
                res = await db.execute(
                    select(TokenPlan).where(
                        TokenPlan.parent_id == suite.id, TokenPlan.name == model_name
                    )
                )
                model = res.scalar_one_or_none()
                if not model:
                    model = TokenPlan(
                        name=model_name,
                        model=f"model-{suite.name.lower()}-{i}",
                        parent_id=suite.id,
                        multiplier=random.choice([0.5, 1.0, 1.0]),
                        is_active=True,
                    )
                    db.add(model)
                models_to_test.append(model)

        await db.flush()
        print(f"Total active models to seed data for: {len(models_to_test)}")

        # 3. Generate historical results
        now = datetime.now(timezone.utc)
        start_time = now - timedelta(days=days)

        total_results = 0
        # Every hour for each model
        current_time = start_time
        while current_time < now:
            for model in models_to_test:
                # Apply multiplier logic roughly
                if random.random() > (model.multiplier or 1.0):
                    continue

                # Performance characteristics based on time of day (local-ish 08:00-20:00)
                # We'll just use UTC for simplicity of generation, the dashboard handles local TZ
                hour = current_time.hour
                is_day = 8 <= hour < 20

                # Base performance for this model
                base_ttft = random.randint(150, 1200)
                base_tps = random.uniform(10, 120)

                # Degradation during "day"
                if is_day:
                    ttft = base_ttft * random.uniform(1.1, 2.5)  # 10% to 150% slower
                    tps = base_tps * random.uniform(0.6, 0.95)  # 10% to 40% slower
                else:
                    ttft = base_ttft * random.uniform(0.9, 1.1)
                    tps = base_tps * random.uniform(0.95, 1.05)

                # Occasional errors
                error = None
                if random.random() < 0.03:  # 3% error rate
                    error = "Connection timeout"
                    ttft, tps = None, None

                tr = TestResult(
                    plan_id=model.id,
                    ttft_ms=ttft,
                    tps_overall=tps,
                    tps_generate=tps * random.uniform(1.1, 1.4) if tps else None,
                    total_tokens=random.randint(100, 300),
                    total_time_ms=2000 if ttft else None,
                    created_at=current_time + timedelta(minutes=random.randint(0, 59)),
                    error=error,
                )
                db.add(tr)
                total_results += 1

            # Progress update
            if total_results % 500 == 0:
                print(f"Generated {total_results} results...")

            current_time += timedelta(hours=1)

        await db.commit()
        print(f"Successfully seeded {total_results} results over {days} days.")


if __name__ == "__main__":
    import sys

    days = 7
    if len(sys.argv) > 1:
        days = int(sys.argv[1])
    asyncio.run(seed_heavy_data(days=days))
