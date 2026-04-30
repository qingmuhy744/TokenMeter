# Spec: Database Migration & Plan Transfer

**Version:** 0.1.0
**Status:** Draft
**Topic:** Automatic SQLite to PostgreSQL migration and Plan configuration import/export.

## 1. Automatic SQLite to PostgreSQL Migration

### Goal
Allow users to switch from the default SQLite database to a PostgreSQL instance without losing data.

### Trigger
- init_db() is called during startup.
- settings.DATABASE_URL is set to a PostgreSQL URL.
- The default SQLite file (settings.DB_PATH) exists and is non-empty.

### Implementation Detail
- **Discovery**: Use SQLAlchemy's inspect or explicit model list (User, Setting, TokenPlan, TestResult) to identify tables to copy.
- **Data Transfer**:
    1. Create a temporary synchronous engine for the SQLite file.
    2. Create a temporary synchronous engine for the PostgreSQL destination.
    3. Iterate through tables in dependency order: users, settings, token_plans, test_results.
    4. For each table:
        - Read all rows from SQLite.
        - Insert all rows into PostgreSQL using bulk_insert_mappings.
    5. **Sequence Reset**: For PostgreSQL, run identity sequence reset for each table with an id column to ensure future auto-increments work.
- **Cleanup**: On successful completion, os.remove(settings.DB_PATH).
- **Error Handling**: If migration fails, log error and abort startup to prevent data loss or partial migration state.

## 2. Plan Configuration Import/Export

### Goal
Provide a human-readable way to backup and transfer Plan configurations between instances.

### Export
- **Endpoint**: GET /api/plans/export
- **Authentication**: Requires admin user.
- **Payload**: JSON array of plans.
- **Exclusions**: Do NOT export id, created_at, updated_at, or associated results.
- **Headers**: Content-Disposition: attachment; filename=tokenmeter-plans.json.

### Import
- **Endpoint**: POST /api/plans/import
- **Authentication**: Requires admin user.
- **Payload**: JSON array of plan objects.
- **Logic**:
    1. Validate each object against PlanCreate schema.
    2. For each plan:
        - Check if name already exists.
        - If exists, append " (Imported)" to the name.
        - Save as a new TokenPlan.
- **Response**: Summary of imported plans count.

### UI Changes
- **Plans Page**: 
    - Add "Export Plans" button.
    - Add "Import Plans" button (triggering a hidden file input).
- **History Page**:
    - Add "Download CSV" button for full results export (bonus).

## 3. Tech Stack
- **Backend**: Python 3.12, SQLAlchemy, Pydantic.
- **Frontend**: React, TypeScript, Tailwind CSS.
