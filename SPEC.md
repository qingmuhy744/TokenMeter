# 2026-04-30 Speed Test Refactor Design

## Goal

Refactor the speed test module to align with industry-standard metrics definitions and add protocol-specific stream parsing state machines with robust error handling.

## Scope

- New metrics: `input_tokens`, `cache_read`, `char_count`, `token_density` (nullable, stored in DB, not displayed in frontend)
- Refactor `SpeedTester` into protocol-specific state machines
- Add robust error handling: debounce, timeout, dangling stream detection

## Changes

### 1. TestResult model — new fields

All nullable (SQLite ALTER TABLE compatible, no migration needed for new installs):

```python
class TestResult(Base):
    # ... existing fields ...
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cache_read: Mapped[int | None] = mapped_column(Integer, nullable=True)
    char_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    token_density: Mapped[float | None] = mapped_column(Float, nullable=True)
```

### 2. SpeedTester refactor — RequestTracker state machine

Replace the current monolithic `_stream_request` with a `RequestTracker` dataclass and per-protocol parsers:

```python
@dataclass
class RequestTracker:
    time_sent: float          # T0: monotonic timestamp
    time_first_token: float | None = None  # T1: first non-empty content
    time_finished: float | None = None     # T2: end signal or last chunk
    char_count: int = 0
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    cache_read: int | None = None
    is_finished: bool = False
    error: str | None = None
```

**OpenAI parser** — `data: [DONE]` → `time_finished`, `choices[0].delta.content` → T1 (debounced: must be non-empty), `usage` → token counts, `finish_reason` → early end signal (wait for usage or [DONE] before exiting)

**Anthropic parser** — `event: content_block_delta` with non-empty `delta.text` or `delta.thinking` → T1, `event: message_start` → `input_tokens`/`cache_read`, `event: message_delta` → `output_tokens`, `event: message_stop` → `time_finished`

### 3. Error handling

- **Debounce**: Only record T1 when `delta.text` is non-empty (skip empty content chunks, role declarations)
- **Timeout**: `httpx.AsyncClient(timeout=httpx.Timeout(connect=10, read=30, write=10, pool=10))`
- **Dangling stream**: If `is_finished = False` after stream ends, set `time_finished` to last chunk time, mark error as "incomplete stream"

### 4. Metrics calculation

After the stream completes:

```
TTFT = time_first_token - time_sent (ms)
Duration_Gen = time_finished - time_first_token (ms)
TPS_Overall = output_tokens / (time_finished - time_sent) * 1000
TPS_Generate = output_tokens / (time_finished - time_first_token) * 1000
Token_Density = char_count / output_tokens (if output_tokens > 0)
```

### 5. Frontend — no display changes

New fields are stored in DB but not displayed in frontend. `token_density` is available for future API use.

### 6. DB migration

Migration file: `backend/migrations/20260430_add_input_tokens_cache_read_char_count_density.sql`

```sql
ALTER TABLE test_results ADD COLUMN input_tokens INTEGER;
ALTER TABLE test_results ADD COLUMN cache_read INTEGER;
ALTER TABLE test_results ADD COLUMN char_count INTEGER;
ALTER TABLE test_results ADD COLUMN token_density FLOAT;
```

## Files changed

- `backend/models.py` — add 4 fields to TestResult
- `backend/services/speed_test.py` — refactor into RequestTracker + protocol parsers
- `backend/schemas.py` — add fields to TestResultResponse
- `backend/routes/public.py` — no change (stats don't need new fields)
- `backend/migrations/20260430_add_input_tokens_cache_read_char_count_density.sql` — migration
- `backend/tests/test_speed_test.py` — update tests for new fields