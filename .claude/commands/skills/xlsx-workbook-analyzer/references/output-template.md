# Output Template: Workbook Documentation

Use this structure when generating documentation for Excel workbooks.

---

## Template

```markdown
# [Workbook Name] - Documentation

## Overview

**File**: [filename.xlsx]
**Sheets**: [N] sheets
**Purpose**: [One sentence describing what this workbook is for]
**Last Modified**: [Date if available]

---

## Sheet Summary

| # | Sheet Name | Rows | Cols | Purpose |
|---|------------|------|------|---------|
| 1 | [Name]     | [N]  | [N]  | [Brief description] |
| 2 | [Name]     | [N]  | [N]  | [Brief description] |

---

## Sheet Details

### Sheet 1: [Name]

**Purpose**: [What this sheet contains/does]
**Dimensions**: [rows] rows x [cols] columns

#### Column Structure

| Col | Header | Data Type | Sample Values | Notes |
|-----|--------|-----------|---------------|-------|
| A   | [name] | [type]    | [examples]    | [any notes] |
| B   | [name] | [type]    | [examples]    | [any notes] |

#### Key Formulas

| Cell/Range | Formula Pattern | Purpose |
|------------|-----------------|---------|
| [ref]      | `[formula]`     | [what it calculates] |

#### Named Ranges (if any)

| Name | Range | Scope | Used By |
|------|-------|-------|---------|
| [name] | [range] | [Workbook/Sheet] | [where referenced] |

#### Data Validation (if any)

| Range | Type | Values/Constraint |
|-------|------|-------------------|
| [range] | [List/Number/etc.] | [allowed values] |

---

### Sheet 2: [Name]

[Repeat structure for each sheet]

---

## Cross-Sheet Relationships

```
[Sheet1]          [Sheet2]          [Sheet3]
┌────────────┐   ┌────────────┐   ┌────────────┐
│            │ → │            │ → │            │
│ [content]  │   │ [content]  │   │ [content]  │
└────────────┘   └────────────┘   └────────────┘
```

### Formula Dependencies

| Source Sheet | Target Sheet | References |
|--------------|--------------|------------|
| [Sheet1]     | [Sheet2]     | [cells/ranges used] |

---

## Named Ranges Summary

| Name | Definition | Scope | Description |
|------|------------|-------|-------------|
| [name] | [range] | [scope] | [what it represents] |

---

## Key Calculations

[Document any significant calculations, totals, or decision logic]

| Calculation | Location | Formula | Description |
|-------------|----------|---------|-------------|
| [name]      | [sheet!cell] | `[formula]` | [what it determines] |

---

## Notes

- [Any assumptions made during analysis]
- [Limitations or areas that need clarification]
- [Recommendations for workbook improvements]
```

---

## Guidelines

1. **Be concise** - One sentence per description, avoid redundancy
2. **Show formulas** - Include actual formula patterns, not just descriptions
3. **Trace dependencies** - Make cross-sheet references explicit
4. **Use tables** - Structured data is easier to scan than paragraphs
5. **Note anomalies** - Hidden sheets, unusual structures, potential issues
6. **Capture purpose** - Focus on what each element does, not just what it contains
