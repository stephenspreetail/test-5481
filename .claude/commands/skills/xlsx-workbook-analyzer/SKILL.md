---
name: xlsx-workbook-analyzer
description: Analyze any Excel workbook (.xlsx, .xlsm) and generate comprehensive markdown documentation describing its structure, contents, formulas, and relationships. Use when asked to "document this workbook", "explain this spreadsheet", "analyze this Excel file", "what does this workbook contain", or any request to understand/describe the structure and logic of an Excel file.
---

# Excel Workbook Analyzer

Generate comprehensive documentation for any Excel workbook, capturing its structure, data, formulas, and relationships.

## Analysis Process

1. **Read the workbook** using openpyxl with `data_only=False` to preserve formulas
2. **Inventory all sheets** - names, dimensions, general purpose
3. **Analyze each sheet**:
   - Column headers and data types
   - Formula patterns and dependencies
   - Named ranges and their usage
   - Data validation rules
   - Conditional formatting rules
4. **Map cross-sheet relationships** - trace formula references between sheets
5. **Identify key calculations** - summary cells, totals, decision logic
6. **Generate documentation** following the output template

## Output Format

**Write the documentation to a markdown file** named `{WorkbookName}_Documentation.md` in the same directory as the source workbook.

Follow the template in [references/output-template.md](references/output-template.md).

## Analysis Code Pattern

```python
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter
import re

wb = load_workbook('file.xlsx', data_only=False)

for sheet_name in wb.sheetnames:
    sheet = wb[sheet_name]

    # Get dimensions
    max_row = sheet.max_row
    max_col = sheet.max_column

    # Analyze cells
    for row in sheet.iter_rows(min_row=1, max_row=max_row, max_col=max_col):
        for cell in row:
            if cell.value:
                # Check if formula
                if isinstance(cell.value, str) and cell.value.startswith('='):
                    # Extract cross-sheet references
                    refs = re.findall(r"'?([^'!]+)'?!([A-Z]+\d+)", cell.value)
                    # refs contains (sheet_name, cell_ref) tuples
```

## Key Elements to Document

| Element | What to Capture |
|---------|-----------------|
| **Sheet Structure** | Name, row/column count, general purpose |
| **Headers** | Column headers from row 1 (or identified header row) |
| **Data Types** | Text, numbers, dates, booleans per column |
| **Formulas** | Pattern, purpose, dependencies |
| **Named Ranges** | Name, scope, range, usage |
| **Validation** | Dropdowns, lists, constraints |
| **Cross-References** | Sheet-to-sheet formula links |

## Analysis Tips

- **Header detection**: Usually row 1, but check for merged cells or multi-row headers
- **Formula patterns**: Group similar formulas (e.g., all SUM formulas in a column)
- **Data regions**: Identify distinct data tables vs. summary sections
- **Hidden content**: Note hidden rows/columns that may contain calculations
- **Pivot tables**: Document source data and configuration
- **Charts**: Note chart types and data sources

## Example Trigger Phrases

- "Document this Excel file"
- "What's in this workbook?"
- "Analyze this spreadsheet structure"
- "Explain what each sheet does"
- "Create documentation for this xlsx"
