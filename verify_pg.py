import asyncio
from sqlalchemy import text
from backend.database import engine


async def verify():
    async with engine.connect() as conn:
        # Check columns
        result = await conn.execute(
            text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'token_plans';
        """)
        )
        columns = [row[0] for row in result.fetchall()]
        print(f"Columns in token_plans: {columns}")

        # Check parent_id and multiplier
        if "parent_id" in columns and "multiplier" in columns:
            print("Columns parent_id and multiplier exist.")
        else:
            print("MISSING columns!")

        # Check data
        result = await conn.execute(
            text("SELECT id, name, model, parent_id FROM token_plans")
        )
        rows = result.fetchall()
        print("\nData in token_plans:")
        for row in rows:
            print(row)


if __name__ == "__main__":
    asyncio.run(verify())
