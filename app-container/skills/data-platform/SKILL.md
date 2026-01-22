---
name: data-platform
description: Query Spreetail's Data Platform (Starburst Galaxy/Trino) for business data like market insights, inventory, and fulfillment. Use when building apps that need company data.
---

# Spreetail Data Platform Integration

Use this skill when building apps that need business data from Spreetail's data warehouse.

## Quick Start

1. **Discover available data** using MCP tools
2. **Generate secure server functions** following patterns in QUERIES.md
3. **Always follow security guidelines** in SECURITY.md

## MCP Tools Available

Use these tools from the `data-catalog` MCP server:

| Tool | Purpose |
|------|---------|
| `mcp__data-catalog__list_domains` | Get overview of data domains (market_insights, inventory, etc.) |
| `mcp__data-catalog__search_tables` | Search tables by keywords, filter by tier/domain |
| `mcp__data-catalog__get_table_schema` | Get column names, types, and descriptions |
| `mcp__data-catalog__get_sample_queries` | Get example SQL for common use cases |
| `mcp__data-catalog__get_connection_template` | Get secure code patterns for Trino connection |
| `mcp__data-catalog__suggest_tables` | Get table recommendations for a use case |
| `mcp__data-catalog__search_columns` | Find columns across all tables |

## Workflow

```
1. User asks for app with business data
   ↓
2. mcp__data-catalog__search_tables("revenue marketplace")
   ↓
3. mcp__data-catalog__get_table_schema("catalog.schema.table")
   ↓
4. mcp__data-catalog__get_connection_template()
   ↓
5. Read SECURITY.md for input sanitization patterns
   ↓
6. Generate server functions in src/server/data/
   ↓
7. Generate TypeScript types in src/types/data/
```

## ⚠️ Environment Variables (CRITICAL)

**DO NOT create `.env` files with DATA_PLATFORM_* variables.**

The container already has these credentials pre-configured:
- `DATA_PLATFORM_HOST`
- `DATA_PLATFORM_USER`
- `DATA_PLATFORM_PASSWORD`

Just use `process.env.DATA_PLATFORM_*` directly in your code. Creating local `.env` files will override the real credentials with placeholders and break data fetching.

## Key Rules

- **NEVER create .env files** for data platform credentials (they're pre-configured)
- **ALWAYS prefer MART tier tables** (production-ready, tested)
- **Connection is READ-ONLY** - never attempt INSERT/UPDATE/DELETE
- **Always include LIMIT clauses** to prevent large result sets
- **Include date filters** when possible to limit data scanned
- **Handle nullable columns** appropriately in TypeScript types

## File Organization

Generated code should follow this structure:
```
src/
├── server/
│   └── data/
│       └── {domain}.ts       # Server functions (e.g., market-insights.ts)
├── types/
│   └── data/
│       └── {domain}.ts       # TypeScript interfaces
└── hooks/
    └── data/
        └── use{Domain}.ts    # TanStack Query hooks (optional)
```

## Related Files

- **QUERIES.md** - Query patterns and code templates
- **SECURITY.md** - SQL injection prevention (CRITICAL - always read before generating queries with user input)
