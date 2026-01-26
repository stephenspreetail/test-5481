# Output Template: Workflow Documentation

Use this structure when generating planning documents.

---

## Template

```markdown
# [Workbook Name] - Workflow Documentation

## Overview

**Purpose**: [One sentence describing what this workbook calculates/decides]
**Sheet Count**: [N] sheets
**Data Flow**: [Parameter Config] → Raw Data → [Processing Steps] → Output

---

## Data Flow Diagram

```
[Sheet1]          [Sheet2]         [Sheet3]          [Sheet4]
┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
│ Parameters │ → │  Raw Data  │ → │ Processing │ → │   Output   │
│            │   │            │   │            │   │            │
│ • param1   │   │ • column1  │   │ • calc1    │   │ • result1  │
│ • param2   │   │ • column2  │   │ • calc2    │   │ • decision │
└────────────┘   └────────────┘   └────────────┘   └────────────┘
      │                                 ▲               ▲
      └─────────────────────────────────┴───────────────┘
                    (parameters feed into calculations)
```

---

## Sheet Details

### Sheet 1: [Name] (Parameters)

**Role**: Configuration parameters that control calculations

| Parameter | Cell | Value/Range | Used By |
|-----------|------|-------------|---------|
| [name]    | [ref]| [value]     | [sheets]|

---

### Sheet 2: [Name] (Raw Data)

**Role**: Source data input

| Column | Description | Data Type | Sample |
|--------|-------------|-----------|--------|
| A      | [desc]      | [type]    | [ex]   |

**Row Count**: [N] data rows (excluding header)

---

### Sheet 3: [Name] (Processing Step 1)

**Role**: [What transformation this sheet performs]

**Key Formulas**:
| Column | Formula Pattern | Purpose |
|--------|-----------------|---------|
| [col]  | `[formula]`     | [desc]  |

**Dependencies**: References [Sheet2].[columns], [Sheet1].[parameters]

---

### Sheet N: [Name] (Output/Decision)

**Role**: Final output and decision logic

**Key Outputs**:
| Output | Cell/Range | Formula | Meaning |
|--------|------------|---------|---------|
| [name] | [ref]      | [form]  | [desc]  |

**Decision Logic**:
- If [condition] → [result]
- If [condition] → [result]

---

## Parameter Impact Analysis

| Parameter | Affects | Impact |
|-----------|---------|--------|
| [param]   | [sheets/calcs] | [description of effect] |

---

## Notes

- [Any assumptions, limitations, or special considerations]
```

---

## Guidelines

1. **Be concise** - One sentence per description, avoid redundancy
2. **Show formulas** - Include actual formula patterns, not just descriptions
3. **Trace dependencies** - Make cross-sheet references explicit
4. **Highlight decisions** - Emphasize the final output logic
5. **Use tables** - Structured data is easier to scan than paragraphs
