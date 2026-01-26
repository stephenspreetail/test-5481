---
name: xlsx-workflow-builder
description: Create workflow-style Excel workbooks from user prompts. Use when the user wants to build a spreadsheet with progressive logic flow (parameters → data → processing → output). Triggers on requests like "create a workflow spreadsheet for", "build an Excel calculator for", or "make a spreadsheet to analyze".
---

# Excel Workflow Builder

Generate structured, formula-driven Excel workbooks that follow workflow patterns.

## When to Use This Skill

Use this skill when the user describes a process, calculation, or decision that should be implemented as an Excel workflow.

Examples:
- "Create a sales commission calculator"
- "Build a spreadsheet to analyze customer lifetime value"
- "Make an inventory reorder decision tool"
- "Create a project budget tracker with approvals"

## MANDATORY Workflow Structure

**CRITICAL**: Every workbook MUST follow this exact left-to-right flow:

```
Sheet 1          Sheet 2       Sheet 3...N-1        Sheet N
┌──────────┐    ┌──────────┐   ┌──────────────┐    ┌──────────┐
│Parameters│ →  │ Raw Data │ → │ Processing   │ →  │  Output  │
│          │    │          │   │ (optional)   │    │ Decision │
└──────────┘    └──────────┘   └──────────────┘    └──────────┘
```

**Each sheet type serves a specific purpose:**

1. **Parameters** (Sheet 1) - Configurable settings (blue text)
   - Examples: rates, thresholds, targets, dates, categories, weights
   - User changes these to run different scenarios
   - NO data entry tables here (those go in Raw Data)

2. **Raw Data** (Sheet 2) - User-entered records (table format)
   - Examples: transaction log, inventory list, workout entries, customer records
   - Has headers in row 1, data in rows below
   - NO calculations here (those go in Processing/Output)

3. **Processing** (Sheet 3+, optional) - Intermediate calculations (formulas)
   - Examples: categorization, lookups, per-row calculations, filtering
   - References Parameters and Raw Data sheets
   - One transformation per sheet for clarity

4. **Output** (Final sheet) - Summary, decisions, recommendations (formulas)
   - Examples: totals, averages, status, recommendations, alerts
   - References all previous sheets
   - Formatted for easy interpretation

## Build Process

### 1. Analyze and Map to Workflow Structure

**BEFORE building**, you MUST explicitly map the user's request to the workflow structure:

Ask yourself:
- **Parameters**: What values might the user want to adjust? (If none, still create a minimal parameters sheet)
- **Raw Data**: What records will the user enter repeatedly? (This must be a table, not individual cells)
- **Processing**: Are there multi-step calculations that need intermediate sheets?
- **Output**: What summaries, metrics, or decisions should be displayed?

### 2. Ask Clarifying Questions if Unclear

**IF the mapping is ambiguous**, ask the user questions like:
- "What values should be adjustable as parameters? (e.g., target pace, budget limits)"
- "What data will you enter repeatedly? (e.g., workout logs, sales transactions)"
- "What calculations should be performed? (e.g., averages, comparisons)"
- "What outputs do you want to see? (e.g., progress toward goal, reorder recommendations)"

**DO NOT proceed** until you can clearly define what goes in each sheet type.

### 3. Design Sheet Structure

Based on complexity:

**Standard (3 sheets)**: Parameters → Raw Data → Output
- Most common pattern
- Use when processing is simple enough to embed in output sheet

**Complex (4+ sheets)**: Parameters → Raw Data → Processing → Output
- Use when calculations are complex or multi-step
- Add processing sheets to break down transformations

**NEVER create**:
- A workbook without Parameters sheet (always needed for scenario testing)
- A workbook without Raw Data sheet (must have data entry area)
- A workbook without Output sheet (must have summary/decision)
- Mixed-purpose sheets (e.g., parameters + data in one sheet)

### 4. Build the Workbook

Use the **xlsx skill** to create the workbook. Follow the implementation guide in [references/implementation-guide.md](references/implementation-guide.md).

**MANDATORY sheet requirements:**

**Sheet 1 - Parameters**:
- Two-column layout: "Parameter" (column A) | "Value" (column B)
- All values in column B formatted as blue text (RGB: 0,0,255)
- Light gray background (RGB: 231,230,230) on value cells
- Create named ranges for each parameter (e.g., `TargetPace`, `CommissionRate`)
- Example data: Target values, rates, thresholds, dates, categories
- NO tables or repeated data entry here

**Sheet 2 - Raw Data**:
- Table format with headers in row 1 (bold, colored background)
- Freeze panes at row 2
- Include 2-3 sample rows to show expected format
- NO formulas in this sheet (pure data entry)
- Apply "Format as Table" style
- Example: Transaction log, workout entries, inventory records

**Sheet 3+ - Processing (if needed)**:
- First column often copies identifiers from Raw Data
- Subsequent columns add one calculation each
- All formulas reference previous sheets
- Black text for all formula results
- Example: Per-row categorization, lookups, calculations

**Final Sheet - Output/Decision**:
- Summary section: Key metrics (totals, averages, counts)
- Decision section: Status indicators, recommendations
- All formulas (black text) reference previous sheets
- Conditional formatting for visual feedback (red/yellow/green)
- Large, bold fonts for key outputs
- Example: "Total Revenue: $50,000", "Status: On Track"

### 5. Formula Patterns (Cross-Sheet References Required)

**ALL formulas must reference previous sheets** (never hardcode calculated values):

**Reference parameters**:
- `=TargetPace` (if named range exists)
- `=Parameters!B2` (direct reference)
- `=Parameters!$B$2` (absolute, for copying down)

**Reference raw data**:
- `='Raw Data'!A2` (single cell)
- `=SUM('Raw Data'!D:D)` (entire column)
- `=AVERAGE('Raw Data'!D2:D50)` (range)

**Processing sheet formulas**:
- `='Raw Data'!A2` (copy identifier)
- `='Raw Data'!C2*CommissionRate` (calculation with parameter)
- `=VLOOKUP(A2, Parameters!A:B, 2, FALSE)` (lookup parameter)

**Output sheet formulas**:
- `=SUM(Processing!D:D)` (aggregate from processing)
- `=COUNTIF('Raw Data'!E:E, "Complete")` (count matching records)
- `=IF(B5>TargetValue, "Goal Met", "Below Target")` (decision logic)
- `=IFS(B5>10000, "High", B5>5000, "Medium", TRUE, "Low")` (multi-level decision)

### 6. Formatting and Usability

- **Color coding**: Blue text = parameters (user inputs), Black text = formulas
- **Headers**: Bold, colored background, frozen panes
- **Parameters**: Light gray background to distinguish from other sheets
- **Conditional formatting**: Red/yellow/green for status indicators on output sheet
- **Data validation**: Dropdowns for parameter choices (e.g., categories, tiers)
- **Comments**: Add to cells explaining complex formulas or assumptions

## Pre-Build Validation Checklist

**BEFORE calling the xlsx skill**, verify:

- [ ] I have clearly identified what goes in Parameters sheet
- [ ] I have clearly identified what goes in Raw Data sheet (must be a table)
- [ ] I have identified what calculations are needed
- [ ] I have identified what outputs/decisions to display
- [ ] If unclear, I have asked the user clarifying questions
- [ ] The structure follows: Parameters → Raw Data → [Processing] → Output
- [ ] I am NOT mixing sheet purposes (e.g., parameters with data entry)

**If any checklist item is unclear, STOP and ask the user questions.**

## Output

Create the Excel file in the current directory with a descriptive name:
- `{Purpose}_Workflow.xlsx`
- Example: `Sales_Commission_Calculator_Workflow.xlsx`

After creation, provide the user with:
1. Confirmation of file creation with path
2. **Description of the workflow structure** showing how data flows through sheets
3. Brief description of each sheet's purpose (what to enter, what it calculates)
4. Instructions on how to use it:
   - Which parameters to adjust (Sheet 1)
   - Where to enter data (Sheet 2)
   - What outputs to review (Final sheet)

## Example Trigger Phrases

- "Create a workflow spreadsheet to calculate sales commissions"
- "Build an Excel tool for inventory reorder decisions"
- "Make a spreadsheet that analyzes customer profitability"
- "Generate a budget tracking workbook with approval workflow"

## Concrete Example: Sales Commission Workflow

To illustrate the mandatory structure, here's how a "sales commission calculator" should be designed:

**Sheet 1 - Parameters**:
```
A1: "Parameter"          B1: "Value"
A2: "Bronze Rate"        B2: 0.05  (blue text, gray background, named range: BronzeRate)
A3: "Silver Rate"        B3: 0.10  (blue text, gray background, named range: SilverRate)
A4: "Gold Rate"          B4: 0.15  (blue text, gray background, named range: GoldRate)
A5: "Bonus Threshold"    B5: 10000 (blue text, gray background, named range: BonusThreshold)
```

**Sheet 2 - Raw Data** (name: "Sales"):
```
A1: "Date"    B1: "Product"    C1: "Amount"    D1: "Tier"
A2: 1/15/26   B2: Widget A     C2: 5000        D2: Bronze
A3: 1/16/26   B3: Widget B     C3: 8000        D3: Silver
(User enters more rows here)
```

**Sheet 3 - Processing** (name: "Calculations"):
```
A1: "Product"                    A2: =Sales!B2
B1: "Amount"                     B2: =Sales!C2
C1: "Rate"                       C2: =VLOOKUP(Sales!D2, Parameters!A:B, 2, FALSE)
D1: "Commission"                 D2: =B2*C2
E1: "Bonus Eligible?"            E2: =IF(B2>BonusThreshold, "Yes", "No")
(Formulas copy down for all sales rows)
```

**Sheet 4 - Output** (name: "Summary"):
```
A1: "Total Sales"                B1: =SUM(Calculations!B:B)
A2: "Total Commission"           B2: =SUM(Calculations!D:D)
A3: "Average Sale"               B3: =AVERAGE(Calculations!B:B)
A5: "Performance Status"         B5: =IF(B1>BonusThreshold, "Bonus Earned!", "Below Threshold")
(B5 has conditional formatting: green if bonus earned, red otherwise)
```

**Key points**:
- Parameters are in their own sheet (not mixed with data)
- Raw Data is a table (not individual parameter cells)
- Processing adds calculations row-by-row
- Output summarizes across all rows
- Clear left-to-right flow through sheets

## Another Example: 5K Fitness Planner

User asks: "Create a 5K fitness planner"

**Step 1 - Analyze**: This request is ambiguous. What's adjustable? What data is entered?

**Step 2 - Ask clarifying questions**:
- "What should be adjustable parameters? (e.g., target finish time, current fitness level)"
- "What data will you log repeatedly? (e.g., daily workouts: date, distance, time)"
- "What outputs do you want? (e.g., progress toward goal pace, training completion rate)"

**Step 3 - Map to structure** (assuming user wants pace tracking):

**Sheet 1 - Parameters**:
```
A1: "Parameter"               B1: "Value"
A2: "Target Finish Time (min)" B2: 30  (blue text, user adjustable)
A3: "Race Distance (km)"       B3: 5   (blue text)
A4: "Target Pace (min/km)"     B4: =B2/B3  (calculated)
A5: "Training Weeks"           B5: 8   (blue text)
```

**Sheet 2 - Raw Data** (name: "Workout Log"):
```
A1: "Date"   B1: "Distance (km)"   C1: "Time (min)"   D1: "Type"   E1: "Notes"
A2: 1/15/26  B2: 3.0                C2: 20             D2: Easy     E2: Felt good
A3: 1/17/26  B3: 5.0                C3: 32             D3: Tempo    E3: Challenging
(User logs workouts here)
```

**Sheet 3 - Processing** (name: "Analysis"):
```
A1: "Date"            A2: ='Workout Log'!A2
B1: "Distance"        B2: ='Workout Log'!B2
C1: "Time"            C2: ='Workout Log'!C2
D1: "Pace (min/km)"   D2: =C2/B2
E1: "vs Target"       E2: =D2-Parameters!$B$4
F1: "Status"          F2: =IF(E2<=0, "Faster", "Slower")
(Formulas copy down)
```

**Sheet 4 - Output** (name: "Progress Summary"):
```
A1: "Total Workouts"           B1: =COUNTA('Workout Log'!A:A)-1
A2: "Total Distance (km)"      B2: =SUM('Workout Log'!B:B)
A3: "Average Pace (min/km)"    B3: =SUM('Workout Log'!C:C)/B2
A4: "Target Pace (min/km)"     B4: =Parameters!B4
A5: "Pace Gap"                 B5: =B3-B4
A6: "Race Readiness"           B6: =IF(B5<=0, "On Track", "Need Improvement")
(B6 has conditional formatting)
```

This follows the workflow structure correctly.

## Tips for Quality Workbooks

- **Always follow the workflow structure**: Parameters → Raw Data → Processing → Output
- **Ask questions if unclear**: Don't guess what goes in each sheet type
- **Keep sheets focused**: One purpose per sheet (no mixing parameters with data)
- **Use named ranges**: Makes formulas readable (`=TargetPace` vs `=Parameters!B4`)
- **Add example data**: Include 2-3 sample rows in Raw Data sheet
- **Test your formulas**: Ensure cross-sheet references work correctly

## Integration with xlsx-workflow-docs

This skill is the inverse of **xlsx-workflow-docs**:
- **xlsx-workflow-builder**: Prompt → Excel workbook
- **xlsx-workflow-docs**: Excel workbook → Documentation

Users can:
1. Use this skill to create a workbook
2. Use xlsx-workflow-docs to generate documentation
3. Iterate on the design based on the documentation
