# Design Spec: Batch Plan Management and Advanced Editor

## 1. Overview
To improve the efficiency of managing large numbers of LLM models, we will implement two complementary batch processing features: 
1. Intelligent comma-splitting in the standard creation dialog.
2. A dedicated Batch Editor for text lists and raw JSON configuration.

## 2. Feature Details

### 2.1 Intelligent Comma-Splitting
- **Location**: `PlanDialog.tsx`
- **Behavior**: When the `model` field contains commas (`,`), the frontend will intercept the submission.
- **Logic**:
    - Split `model` string by `,` or `，`.
    - Trim each resulting model name.
    - If multiple models exist:
        - Generate `name` as `ParentName (ModelName)`.
        - Sequentially call `api.createPlan` for each model.
        - Inherit all other form fields (api_base, api_key, etc.) for each request.

### 2.2 Batch Import Dialog
- **Location**: New component `frontend/src/pages/Plans/BatchImportDialog.tsx`.
- **Modes**:
    - **Simple List**: User selects a Provider and pastes a list of model IDs (one per line). 
    - **JSON Editor**: User pastes a full JSON array of plan objects.
- **JSON Format Support**:
    ```json
    [
      { "name": "Custom Name", "model": "gpt-4o", "parent_id": 1, "multiplier": 0.5 },
      { "model": "claude-3-5-sonnet", "parent_id": 2 }
    ]
    ```
- **Error Handling**: Real-time JSON validation with descriptive error messages.

## 3. UI/UX Improvements
- **Button Group**: Add a "Batch" button with `ListPlus` or `Code2` icon next to "Add Plan".
- **Naming Conventions**: Automated naming for batch-created items to prevent generic titles.
- **Feedback**: Use `toast` to show progress for batch operations (e.g., "Created 5 of 8 models").

## 4. Success Criteria
- [ ] Users can create 10 models in seconds by pasting a comma-separated list.
- [ ] Advanced users can import/export entire configurations via JSON.
- [ ] No regression in single-plan creation logic.
