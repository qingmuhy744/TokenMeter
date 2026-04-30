# Delete Speed Test Result Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to delete individual speed test results from the history page to clean up erroneous data.

**Architecture:** Add a DELETE endpoint to the backend results router and a delete action to the frontend history table.

**Tech Stack:** FastAPI, SQLAlchemy, React, Tailwind CSS.

---

### Task 1: Backend Deletion Endpoint

**Files:**
- Modify: `backend/routes/results.py`
- Test: `backend/tests/test_results.py`

- [ ] **Step 1: Add DELETE route to `backend/routes/results.py`**

```python
@router.delete("/{result_id}")
async def delete_result(request: Request, result_id: int):
    await get_current_user(request)
    async with async_session() as db:
        result = await db.execute(select(TestResult).where(TestResult.id == result_id))
        item = result.scalar_one_or_none()
        if not item:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Result not found")
        await db.delete(item)
        await db.commit()
    return {"ok": True}
```

- [ ] **Step 2: Add test case to `backend/tests/test_results.py`**

```python
@pytest.mark.asyncio
async def test_delete_result(auth_client: AsyncClient, db_session):
    from backend.models import TestResult
    import datetime
    # Create a dummy result
    res = TestResult(plan_id=1, created_at=datetime.datetime.now())
    db_session.add(res)
    await db_session.commit()
    res_id = res.id

    resp = await auth_client.delete(f"/api/results/{res_id}")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    # Verify deleted
    check = await db_session.execute(select(TestResult).where(TestResult.id == res_id))
    assert check.scalar_one_or_none() is None
```

- [ ] **Step 3: Run tests**

Run: `uv run pytest backend/tests/test_results.py`

### Task 2: Frontend API and Translations

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/i18n/locales/zh.json`
- Modify: `frontend/src/i18n/locales/en.json`

- [ ] **Step 1: Update `frontend/src/api/client.ts`**

Add `deleteResult: (id: number) => request(\`/results/\${id}\`, { method: "DELETE" }),` to the `api` object.

- [ ] **Step 2: Add translations to `zh.json`**

In `history` section:
```json
"delete": "删除",
"deleteConfirm": "确定删除这条测试记录吗？"
```

- [ ] **Step 3: Add translations to `en.json`**

In `history` section:
```json
"delete": "Delete",
"deleteConfirm": "Are you sure you want to delete this test result?"
```

### Task 3: History Page UI Update

**Files:**
- Modify: `frontend/src/pages/History.tsx`

- [ ] **Step 1: Add delete logic and action column**

- Add `handleDelete` function.
- Add `actions` column to `TableHeader`.
- Add `TableCell` with a delete `Button`.

```tsx
  const handleDelete = async (id: number) => {
    if (!confirm(t("history.deleteConfirm"))) return;
    try {
      await api.deleteResult(id);
      setResults(prev => ({
        ...prev,
        items: prev.items.filter(r => r.id !== id),
        total: prev.total - 1
      }));
    } catch (err: any) {
      alert(err.message);
    }
  };
```

### Task 4: Verification and Commit

- [ ] **Step 1: Verify full flow manually or with tests**
- [ ] **Step 2: Commit all changes (including previous speed test fixes)**

```bash
git add backend/services/speed_test.py backend/routes/results.py backend/tests/test_results.py frontend/src/api/client.ts frontend/src/i18n/locales/*.json frontend/src/pages/History.tsx
git commit -m "feat: add individual result deletion and fix speed test parsing issues"
```
