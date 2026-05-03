# Design Spec: Hierarchical Token Plans Management

## 1. Overview
The goal is to transform the flat Token Plans list into a hierarchical structure (Provider -> Model). This allows users to manage common configurations at the Provider level while overriding specific settings at the Model level.

## 2. Backend Architecture Changes (`backend/schemas.py`)
To maintain the "Single Source of Truth", the backend will expose calculated configuration values through the API.

### 2.1 Schema Updates
Extend `PlanResponse` to include the following fields (mapped from `TokenPlan` model properties):
- `effective_api_type`: str
- `effective_api_base`: str
- `effective_api_key`: str (masked version)
- `effective_model`: str
- `effective_prompt`: str
- `effective_max_tokens`: int
- `effective_test_count`: int

## 3. Frontend Architecture Changes (`frontend/src/pages/Plans.tsx`)

### 3.1 Data Transformation
Implement a `useMemo` hook to convert the flat `plans` array into a tree structure.
- **Helper**: `const planTree = buildPlanTree(plans);`
- **Output**: Each item includes a `children` array.

### 3.2 UI Rendering
- **Table Rows**: 
    - Parent rows (Provider) remain top-level.
    - Child rows (Model) are rendered immediately below their parent with a left indentation (e.g., `pl-8`).
    - Visual indicator: A connecting line icon (e.g., `└─`) before the child's name.
- **Inheritance Visuals**:
    - If `plan.api_base === null`, display `plan.effective_api_base` in grey italics.
    - Add a Tooltip explaining the value is inherited from the parent.

### 3.3 Interactive Improvements
- **Edit Modal**:
    - When a `parent_id` is selected, update `placeholder` values of all optional fields to match the parent's current configuration.
    - Add a legend: "Empty fields will inherit values from the parent."
- **Cascaded Delete**:
    - If a plan has children (`children.length > 0`), trigger a high-severity alert dialog.
    - Alert: "Deleting this provider will also delete **[X]** associated models. This action is irreversible."

## 4. Implementation Goals
1. **Consistency**: Ensure UI displayed values match the actual values used by the speed test engine.
2. **Usability**: Make the Provider-Model relationship visually obvious.
3. **Safety**: Prevent accidental deletion of multiple models through explicit warnings.

## 5. Success Criteria
- [ ] Plans list correctly indents child models.
- [ ] Inherited values are visually distinguishable from overridden values.
- [ ] Deleting a provider with models requires double-confirmation.
- [ ] API returns all required `effective_` fields.
