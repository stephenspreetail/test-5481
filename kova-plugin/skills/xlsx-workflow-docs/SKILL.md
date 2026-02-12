---
name: xlsx-workflow-docs
description: Analyze workflow-style Excel workbooks and generate clear markdown documentation. Use when given an .xlsx file that represents a progressive workflow where sheets flow left-to-right: parameters → raw data → processing steps → output/decision. Triggers on requests like "document this workbook", "explain this Excel workflow", or "create planning doc for this spreadsheet".
---

# Excel Workflow Documentation Generator

Generate succinct, logical planning documents for workflow-style Excel workbooks.

## Workflow Structure Expected

```
Sheet 1          Sheet 2       Sheet 3...N-1        Sheet N
┌──────────┐    ┌──────────┐   ┌──────────────┐    ┌──────────┐
│Parameters│ →  │ Raw Data │ → │ Processing   │ →  │  Output  │
│(optional)│    │          │   │ Steps        │    │ Decision │
└──────────┘    └──────────┘   └──────────────┘    └──────────┘
```

## Analysis Process

1. **Read the workbook** using xlsx skill capabilities
2. **Identify sheet roles** based on position and content:
   - First sheet: Check if parameters/config (named ranges, single values, dropdowns)
   - Second sheet: Raw data (table format, no formulas referencing other sheets)
   - Middle sheets: Processing steps (formulas referencing previous sheets)
   - Last sheet: Output/decision (summary, final calculations, decision logic)
3. **Trace formula dependencies** between sheets
4. **Document each sheet's purpose** and transformations

## Output Format

**Write the documentation to a markdown file** named `{WorkbookName}_Workflow.md` in the same directory as the source workbook.

### Required Output Structure

The output MUST follow this exact structure:

1. **App Build Prompt** (prepend at the very top of the file):
```
Create a "{WorkbookName}" app that mimics workflow steps as described below. Use a modern, monochrome ui design.

The app must:
- Provide a sample Excel download in the Raw input sheet's required format with 25 records
- Accept an Excel file upload in the Raw input sheet's required format
- Provide tabs to view: Parameters -> Raw Data -> Processing -> Output
- Pre-populate parameters
- Not pre-populate the raw data in the app - the user must upload a sheet
- Provide a "Process Results" button that processes the raw data through the steps and produces the Output
```

2. **Workflow Documentation** following the template in [references/output-template.md](references/output-template.md)

Key sections in the documentation:
- Workbook overview (purpose, sheet count, data flow)
- Sheet-by-sheet breakdown (role, key columns, formulas, dependencies)
- Data flow diagram (ASCII showing sheet relationships)
- Parameter impact analysis (what parameters affect which calculations)

## Analysis Tips

- **Parameters sheet**: Look for named ranges, validation lists, standalone cells with labels
- **Raw data sheet**: Typically has headers in row 1, no cross-sheet references
- **Processing sheets**: Follow formula chains to understand transformations
- **Output sheet**: Often has conditional formatting, summary statistics, or decision logic (IF statements)

## Example Trigger Phrases

- "Document this Excel workflow"
- "Create a planning doc for [file.xlsx]"
- "Explain how this workbook processes data"
- "What does each sheet in this workbook do?"
