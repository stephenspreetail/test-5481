# Implementation Guide: Building Workflow Spreadsheets

Step-by-step guide for creating workflow-style Excel workbooks.

---

## Prerequisites

You must have access to the **xlsx skill** to create and manipulate Excel files.

---

## CRITICAL: Workflow Structure First

**Before writing any code**, you MUST be able to clearly answer:
1. What goes in the Parameters sheet?
2. What goes in the Raw Data sheet?
3. What calculations are needed?
4. What outputs should be displayed?

**If any of these are unclear from the user's request, STOP and ask clarifying questions.**

Example questions:
- "What values should be adjustable parameters?"
- "What data will you be entering repeatedly?"
- "What calculations should I perform on the data?"
- "What summary or decision should the output show?"

**Only proceed once you can map the request to: Parameters → Raw Data → Processing → Output**

---

## Step-by-Step Build Process

### Step 1: Analyze the User's Request

Parse the prompt to identify:

1. **Parameters** - Configurable values that control the workflow
   - Examples: Interest rates, tax rates, thresholds, targets, dates, categories, weights
   - Look for: "rate of X%", "threshold", "target", "based on", "assuming", "goal"
   - **If none found**: Ask user what should be adjustable

2. **Raw Data** - What data the user will input repeatedly (table format)
   - Examples: Transaction records, workout logs, inventory items, customer records
   - Look for: "list of", "track", "log", "record", "enter", "daily", "weekly"
   - **Must be a table** with headers and multiple rows of data
   - **If unclear**: Ask user what data they'll enter

3. **Processing Logic** - Transformations and calculations
   - Examples: Filtering, categorizing, per-row calculations, lookups, scoring
   - Look for: "calculate", "determine", "analyze", "filter", "categorize"
   - **If complex**: Break into multiple processing sheets

4. **Outputs** - What results or decisions are needed
   - Examples: Totals, averages, recommendations, status indicators, priorities, alerts
   - Look for: "show", "display", "summary", "decide", "recommend", "status"
   - **If unclear**: Ask what insights they want to see

### Step 2: Design Sheet Layout

**MANDATORY WORKFLOW STRUCTURE**: All workbooks must follow this pattern:

```
Parameters → Raw Data → [Processing] → Output
```

**Parameters sheet is ALWAYS required** - even if there's only one parameter, create this sheet to enable scenario analysis.

Choose complexity level:

#### 3-Sheet Layout (Standard) - Most Common
```
Sheet1: Parameters → Sheet2: Raw Data → Sheet3: Output
```
Use when: Processing is simple enough to embed formulas in Output sheet

#### 4+ Sheet Layout (Complex)
```
Sheet1: Parameters → Sheet2: Raw Data → Sheet3: Processing → Sheet4: Output
```
Use when: Multi-step transformations benefit from intermediate calculation sheets

**NEVER create**:
- Workbooks without a Parameters sheet
- Workbooks where parameters and data are mixed in one sheet
- Workbooks with only static data (no data entry area)

### Step 3: Build Sheet 1 (Parameters)

**When to include**: User mentions configurable values, rates, thresholds, or assumptions.

**Layout**:
| A (Label) | B (Value) |
|-----------|-----------|
| Parameter Name | Value |

**Example**:
```
A1: "Parameter"         B1: "Value"
A2: "Commission Rate"   B2: 0.15
A3: "Min Threshold"     B3: 1000
A4: "Tax Rate"          B4: 0.08
```

**Named Ranges**: Create named ranges for easier formula writing
- `CommissionRate` → `Parameters!B2`
- `MinThreshold` → `Parameters!B3`
- `TaxRate` → `Parameters!B4`

**Formatting**:
- Header row: Bold, background color (light blue)
- Value cells: Light gray background
- Number formats: Percentages as `0.00%`, currency as `$#,##0.00`
- Add data validation for dropdown choices

### Step 4: Build Sheet 2 (Raw Data)

**Layout**: Structured table with headers in row 1

**Example** (Sales data):
```
A1: "Date"  B1: "Product"  C1: "Quantity"  D1: "Price"
A2: 1/15/26 B2: Widget A   C2: 10         D2: 50.00
A3: 1/16/26 B3: Widget B   C3: 5          D3: 75.00
```

**Best Practices**:
- Row 1: Headers (bold, background color, frozen panes)
- Include 2-3 sample rows to demonstrate expected format
- Use consistent data types per column (dates, numbers, text)
- No formulas in this sheet (pure data entry)
- Apply table formatting (`Format as Table`)

### Step 5: Build Processing Sheets (Optional)

**When to include**: Multi-step transformations that are easier to understand when broken down.

**Pattern**: Each column uses formulas referencing previous sheets

**Example** (Processing sheet):
```
A1: "Product"                A2: =Data!B2
B1: "Revenue"                B2: =Data!C2*Data!D2
C1: "Commission"             C2: =B2*CommissionRate
D1: "Net After Commission"   D2: =B2-C2
```

**Best Practices**:
- First column often copies key identifiers from data sheet
- Each column adds one transformation
- Use absolute references for parameters: `$Parameters.$B$2`
- Copy formulas down for all data rows
- Name this sheet descriptively (e.g., "Calculations", "Processing", "Analysis")

### Step 6: Build Final Sheet (Output/Decision)

**Layout**: Summary statistics and decision logic

**Example sections**:

1. **Summary Statistics**:
```
A1: "Total Revenue"      B1: =SUM(Processing!B:B)
A2: "Total Commission"   B2: =SUM(Processing!C:C)
A3: "Average Sale"       B3: =AVERAGE(Processing!B:B)
```

2. **Decision Logic**:
```
A5: "Status"
B5: =IF(B1>MinThreshold, "Goal Met", "Below Target")

A7: "Priority Level"
B7: =IFS(B1>10000, "High", B1>5000, "Medium", TRUE, "Low")
```

3. **Conditional Formatting**:
- Green fill if "Goal Met", red if "Below Target"
- Color scale for priority levels

**Best Practices**:
- Group related outputs together
- Use clear labels in column A
- Add borders around sections
- Apply number formatting to results
- Include a "Last Updated" cell with `=TODAY()`

### Step 7: Apply Formatting

**Global**:
- Freeze panes (row 1 on all data sheets)
- Set column widths for readability
- Apply consistent color scheme across sheets

**Parameters Sheet**:
- Light blue/gray background to distinguish
- Bold labels

**Data Sheet**:
- Table formatting (`Format as Table`)
- Alternating row colors
- Filter buttons on headers

**Output Sheet**:
- Larger, bold fonts for key metrics
- Conditional formatting for decisions
- Borders to separate sections

### Step 8: Add Data Validation

**Where to use**:
- Parameters with fixed choices (dropdowns)
- Data entry fields with constraints

**Example**:
```
Parameters!B2 (Commission Tier):
  Data Validation → List → "Bronze,Silver,Gold"

Data!C:C (Quantity):
  Data Validation → Whole Number → Greater than 0
```

### Step 9: Document the Workbook

Add a "Instructions" or "Notes" section, typically at the top of the Parameters sheet or as a separate sheet:

```
Instructions:
1. Update parameters in the Parameters sheet as needed
2. Enter your data in the RawData sheet (delete sample rows)
3. View results in the Results sheet
4. Do not modify formulas unless you understand them

Assumptions:
- Commission rate applied uniformly to all sales
- Threshold is monthly target
```

---

## Formula Reference

### Cross-Sheet References

```excel
=SheetName!A1           # Single cell
=SheetName!A:A          # Entire column
=SheetName!A1:B10       # Range
=SheetName!$A$1         # Absolute reference
```

### Common Patterns

**Reference parameter**:
```excel
=ParameterSheetName          # If named range
=Parameters!B2               # Direct reference
=Parameters!$B$2             # Absolute (for copying)
```

**Aggregate from previous sheet**:
```excel
=SUM(Data!D:D)
=AVERAGE(Processing!C:C)
=COUNTIF(Data!E:E, "Complete")
=SUMIF(Data!B:B, "Widget A", Data!D:D)
```

**Lookup from another sheet**:
```excel
=VLOOKUP(A2, Parameters!A:B, 2, FALSE)
=XLOOKUP(A2, Data!A:A, Data!C:C)
=INDEX(Data!C:C, MATCH(A2, Data!A:A, 0))
```

**Decision logic**:
```excel
=IF(B2>Threshold, "High", "Low")
=IFS(B2>10000, "Tier 1", B2>5000, "Tier 2", TRUE, "Tier 3")
=SWITCH(A2, "A", 100, "B", 50, "C", 25, 0)
```

---

## Quality Checklist

**CRITICAL - Workflow Structure Validation**:

- [ ] **Sheet 1 is Parameters** (not data entry, not output)
- [ ] **Sheet 2 is Raw Data** (table format with headers, not individual cells)
- [ ] **Processing sheets** (if any) contain only formulas referencing previous sheets
- [ ] **Final sheet is Output** (summary and decisions, not data entry)
- [ ] **Clear left-to-right flow**: Parameters → Raw Data → [Processing] → Output
- [ ] **No mixed-purpose sheets** (e.g., parameters mixed with data)

**Formatting and Formulas**:

- [ ] All formulas reference correct sheets and cells (no hardcoded calculated values)
- [ ] Named ranges are created for key parameters
- [ ] Parameter values have blue text (RGB: 0,0,255) and gray background
- [ ] Formula results have black text
- [ ] Headers are bold and have background color
- [ ] Panes are frozen on data sheets (row 2)
- [ ] Sample data is included in Raw Data sheet (2-3 rows)
- [ ] Number formats are applied (%, $, dates)
- [ ] Conditional formatting highlights key outputs on Output sheet
- [ ] Data validation is set where appropriate (parameter dropdowns)
- [ ] Sheet names are descriptive and match their purpose
- [ ] Instructions/notes are included (on Parameters or Output sheet)
- [ ] File name is descriptive: `{Purpose}_Workflow.xlsx`

---

## Testing Your Workbook

1. Open the generated file
2. Verify all formulas calculate correctly
3. Change a parameter value → confirm output updates
4. Add a data row → confirm calculations extend
5. Check that cross-sheet references work
6. Verify conditional formatting triggers properly

---

## Common Pitfalls

**Circular References**:
- Avoid: Sheet A references Sheet B which references Sheet A
- Solution: Ensure linear data flow (left to right)

**Broken References**:
- Test all cross-sheet formulas after creation
- Use named ranges to make formulas more robust

**Over-Complexity**:
- Don't create 6 sheets if 3 will do
- Each sheet should have a clear, distinct purpose

**Missing Context**:
- Always include instructions or notes
- Add sample data so user understands the format
- Comment complex formulas

---

## Example: Sales Commission Calculator

**User Request**: "Create a sales commission calculator where commission rate varies by tier and we track monthly sales."

**Analysis**:
- Parameters: Commission rates per tier
- Raw Data: Sales transactions (date, product, amount, tier)
- Processing: Calculate commission per sale
- Output: Total sales, total commission, summary by tier

**Structure** (3 sheets):

1. **Parameters**:
   ```
   A1: "Tier"  B1: "Rate"
   A2: Bronze  B2: 0.05
   A3: Silver  B3: 0.10
   A4: Gold    B4: 0.15
   ```

2. **Sales**:
   ```
   A1: Date  B1: Product  C1: Amount  D1: Tier
   (user enters data here)
   ```

3. **Results**:
   ```
   A1: "Total Sales"        B1: =SUM(Sales!C:C)
   A2: "Total Commission"   B2: =SUMPRODUCT((Sales!C:C)*(VLOOKUP(Sales!D:D,Parameters!A:B,2,0)))
   A4: "By Tier:"
   A5: "Bronze"             B5: =SUMIF(Sales!D:D,"Bronze",Sales!C:C)
   (etc.)
   ```

---

## Summary

The workflow builder creates structured, formula-driven workbooks that follow these principles:

1. **Left-to-right flow**: Parameters → Data → Processing → Output
2. **Named ranges**: Make formulas readable
3. **Clear separation**: Each sheet has one role
4. **User-friendly**: Formatting, validation, instructions
5. **Tested**: All formulas work, sample data included

Follow this guide to create professional, maintainable workflow spreadsheets.
