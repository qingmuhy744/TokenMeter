# Database Migration & Plan Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement automatic SQLite to PostgreSQL migration on startup and JSON-based Plan configuration import/export.

**Architecture:** 
- **Migration**: A robust row-by-row copier in `backend/migrations/manager.py` that handles cross-database data types and PostgreSQL sequence resets.
- **Import/Export**: New API endpoints in `backend/routes/plans.py` using Pydantic for serialization and handling name collisions during import.

**Tech Stack:** Python 3.12, SQLAlchemy, Pydantic, React, Tailwind CSS.

---

## Task 1: Robust Migration Manager

**Files:**
- Modify: `backend/migrations/manager.py`
- Modify: `backend/database.py`

- [ ] **Step 1: Implement migrate_sqlite_to_pg in manager.py**

```python
import os
import logging
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)

def migrate_sqlite_to_pg(sqlite_path, pg_url, models):
    """Synchronous migration helper for row-by-row copy."""
    # Use sync engines for simpler row-by-row iteration
    sync_sqlite = create_engine(f"sqlite:///{sqlite_path}")
    sync_pg = create_engine(pg_url.replace("postgresql+asyncpg://", "postgresql://"))
    
    SqliteSession = sessionmaker(sync_sqlite)
    PgSession = sessionmaker(sync_pg)
    
    with SqliteSession() as src, PgSession() as dst:
        logger.info("Starting SQLite to PostgreSQL migration...")
        
        for model in models:
            table_name = model.__tablename__
            logger.info(f"Copying table: {table_name}")
            
            rows = src.execute(select(model)).all()
            if not rows:
                continue
            
            mappings = [dict(row._mapping) for row in rows]
            
            # Clear target table just in case
            dst.execute(text(f"TRUNCATE TABLE {table_name} CASCADE"))
            
            # Bulk insert
            dst.execute(model.__table__.insert(), mappings)
            
            # Reset identity sequence for PostgreSQL
            if "id" in [c.name for c in model.__table__.columns]:
                try:
                    dst.execute(text(f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), COALESCE(MAX(id), 1), false) FROM {table_name}"))
                except Exception as e:
                    logger.warning(f"Could not reset sequence for {table_name}: {e}")
        
        dst.commit()
        logger.info("Migration successful.")
    return True
```

- [ ] **Step 2: Update manager.py to include the logic in run_migrations**

```python
# In backend/migrations/manager.py

async def run_migrations(db):
    from backend.models import User, Setting, TokenPlan, TestResult
    
    # 1. Handle SQLite -> PG Migration if needed
    if "postgresql" in settings.database_url and os.path.exists(settings.DB_PATH):
        # Double check if PG is empty
        result = await db.execute(select(User))
        if result.first() is None:
            logger.info("PostgreSQL detected and empty, and SQLite file exists. Triggering migration.")
            try:
                migrate_sqlite_to_pg(settings.DB_PATH, settings.database_url, [User, Setting, TokenPlan, TestResult])
                # Cleanup
                os.remove(settings.DB_PATH)
                logger.info(f"Removed old SQLite file: {settings.DB_PATH}")
            except Exception as e:
                logger.error(f"Migration failed: {e}")
    
    # 2. Run existing schema migrations (current logic)
    current = await get_current_version(db)
    # ... rest of existing run_migrations
```

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/manager.py
git commit -m "feat: implement robust SQLite to PostgreSQL migration"
```

---

## Task 2: Plan Export API

**Files:**
- Modify: `backend/routes/plans.py`

- [ ] **Step 1: Add export_plans endpoint**

```python
from fastapi import Response
import json

@router.get("/export")
async def export_plans(request: Request):
    await get_current_user(request)
    async with async_session() as db:
        result = await db.execute(select(TokenPlan))
        plans = result.scalars().all()
        
        export_data = []
        for p in plans:
            export_data.append({
                "name": p.name,
                "api_type": p.api_type,
                "api_base": p.api_base,
                "api_key": p.api_key,
                "model": p.model,
                "prompt": p.prompt,
                "max_tokens": p.max_tokens,
                "test_count": p.test_count,
                "interval_minutes": p.interval_minutes,
                "is_active": p.is_active,
            })
            
        content = json.dumps(export_data, indent=2, ensure_ascii=False)
        return Response(
            content=content,
            media_type="application/json",
            headers={
                "Content-Disposition": "attachment; filename=tokenmeter-plans.json"
            }
        )
```

- [ ] **Step 2: Commit**

```bash
git add backend/routes/plans.py
git commit -m "feat: add plan export endpoint"
```

---

## Task 3: Plan Import API

**Files:**
- Modify: `backend/routes/plans.py`

- [ ] **Step 1: Add import_plans endpoint**

```python
from backend.schemas import PlanCreate

@router.post("/import")
async def import_plans(request: Request, plans_to_import: list[dict]):
    await get_current_user(request)
    count = 0
    async with async_session() as db:
        for plan_dict in plans_to_import:
            try:
                # Basic validation
                PlanCreate(**plan_dict)
                
                name = plan_dict["name"]
                while True:
                    collision = await db.execute(select(TokenPlan).where(TokenPlan.name == name))
                    if collision.scalar_one_or_none():
                        name = f"{name} (Imported)"
                    else:
                        break
                
                new_plan = TokenPlan(
                    name=name,
                    api_type=plan_dict["api_type"],
                    api_base=plan_dict["api_base"],
                    api_key=plan_dict["api_key"],
                    model=plan_dict["model"],
                    prompt=plan_dict.get("prompt"),
                    max_tokens=plan_dict.get("max_tokens", 256),
                    test_count=plan_dict.get("test_count", 3),
                    interval_minutes=plan_dict.get("interval_minutes", 60),
                    is_active=plan_dict.get("is_active", True),
                )
                db.add(new_plan)
                count += 1
            except Exception as e:
                logger.error(f"Failed to import plan: {e}")
                
        await db.commit()
    return {"message": f"Successfully imported {count} plans"}
```

- [ ] **Step 2: Commit**

```bash
git add backend/routes/plans.py
git commit -m "feat: add plan import endpoint"
```

---

## Task 4: Frontend UI for Import/Export

**Files:**
- Modify: `frontend/src/pages/Plans.tsx`

- [ ] **Step 1: Add Export/Import buttons to Plans page**
- [ ] **Step 2: Implement handleExport and handleImport logic**
- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Plans.tsx
git commit -m "feat: add import/export buttons to Plans page"
```
