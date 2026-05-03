"""
Seed heavy fake data for development/testing the Matrix Dashboard and History performance.
Run with: uv run python -m backend.seed_heavy [days] [--clear]
"""

import asyncio
import random
import sys
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, delete
from backend.database import async_session
from backend.models import TokenPlan, TestResult


async def seed_heavy_data(days: int = 7, clear: bool = False):
    async with async_session() as db:
        if clear:
            print("Clearing existing data (plans and results)...")
            await db.execute(delete(TestResult))
            await db.execute(delete(TokenPlan))
            await db.commit()

        # 1. Diverse Providers
        providers = [
            ("OpenAI", "openai", "https://api.openai.com/v1"),
            ("Anthropic", "anthropic", "https://api.anthropic.com/v1"),
            ("DeepSeek", "openai", "https://api.deepseek.com/v1"),
            ("SiliconFlow", "openai", "https://api.siliconflow.cn/v1"),
            ("Groq", "openai", "https://api.groq.com/openai/v1"),
            ("Mistral", "openai", "https://api.mistral.ai/v1"),
        ]

        suites = []
        for name, api_type, base in providers:
            # Always ensure these providers exist if we want diversity
            res = await db.execute(
                select(TokenPlan).where(
                    TokenPlan.name == name, TokenPlan.parent_id.is_(None)
                )
            )
            suite = res.scalar_one_or_none()
            if not suite:
                print(f"Creating suite: {name}")
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

        # 2. Create models for each suite
        models_to_test = []
        for suite in suites:
            # Create 3 models per suite
            for i in range(3):
                model_name = f"{suite.name}-Model-{i + 1}"
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
                        max_tokens=512,
                        test_count=3,
                    )
                    db.add(model)
                models_to_test.append(model)

        await db.flush()
        print(f"Total models to generate data for: {len(models_to_test)}")

        # 3. Generate historical results
        now = datetime.now(timezone.utc)
        start_time = now - timedelta(days=days)

        total_results = 0
        current_time = start_time

        # We'll batch commits for speed
        while current_time < now:
            for model in models_to_test:
                # Basic multiplier check
                if random.random() > (model.multiplier or 1.0):
                    continue

                # Performance based on "Day" (08:00 - 20:00 UTC for simplicity in generator)
                hour = current_time.hour
                is_day = 8 <= hour < 20

                # Each model has a unique base performance
                seed_val = model.id * 100
                base_ttft = (seed_val % 800) + 200  # 200ms - 1000ms
                base_tps = 20 + (seed_val % 80)  # 20 - 100 tps

                if is_day:
                    # Degradation: TTFT increases, TPS decreases
                    ttft = base_ttft * random.uniform(1.2, 3.0)
                    tps = base_tps * random.uniform(0.5, 0.8)
                else:
                    # Stable performance at night
                    ttft = base_ttft * random.uniform(0.9, 1.1)
                    tps = base_tps * random.uniform(0.95, 1.05)

                error = None
                if random.random() < 0.02:  # 2% error rate
                    error = "Provider overloaded"
                    ttft, tps = None, None

                tr = TestResult(
                    plan_id=model.id,
                    ttft_ms=ttft,
                    tps_overall=tps,
                    tps_generate=tps * random.uniform(1.1, 1.3) if tps else None,
                    total_tokens=random.randint(150, 400),
                    total_time_ms=2500 if ttft else None,
                    created_at=current_time + timedelta(minutes=random.randint(0, 59)),
                    error=error,
                )
                db.add(tr)
                total_results += 1

            if total_results % 1000 == 0:
                print(f"Generated {total_results} results...")

            current_time += timedelta(hours=1)

        await db.commit()
        print(
            f"\nSUCCESS: Seeded {total_results} results over {days} days for {len(models_to_test)} models."
        )


if __name__ == "__main__":
    days = 7
    clear = False

    for arg in sys.argv[1:]:
        if arg == "--clear":
            clear = True
        elif arg.isdigit():
            days = int(arg)

    asyncio.run(seed_heavy_data(days=days, clear=clear))
