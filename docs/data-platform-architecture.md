# Data Platform Architecture

## Executive Summary

The Data Platform integration provides a comprehensive system for Kova AI agents to discover, understand, and access Spreetail's enterprise data warehouse via Starburst Galaxy/Trino. This document details the architecture, components, and usage patterns.

**Note:** As of the `@kova/agent` refactor, all data platform code has been moved from `app-container/` to `packages/agent/src/data-platform/`. This centralizes the functionality in the reusable agent package.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Components](#components)
   - [Data Source Clients](#data-source-clients)
   - [Metadata Catalog](#metadata-catalog)
   - [MCP Server](#mcp-server)
   - [Skills Integration](#skills-integration)
4. [Data Flow](#data-flow)
5. [Key Design Decisions](#key-design-decisions)
6. [Security Considerations](#security-considerations)
7. [Configuration](#configuration)
8. [Usage Patterns](#usage-patterns)
9. [Extending the System](#extending-the-system)

---

## Overview

The Data Platform module enables AI agents to:

- **Discover** available data domains and tables through semantic search
- **Understand** table schemas, column types, and business context
- **Generate** secure, production-ready code for data access
- **Query** Starburst Galaxy/Trino directly with proper security patterns

### Key Capabilities

| Capability | Description |
|------------|-------------|
| Metadata Discovery | MiniSearch-powered fuzzy search across tables and columns |
| Schema Introspection | Full column definitions with types, descriptions, and examples |
| Code Generation | Pre-built templates for TanStack Start server functions |
| dbt Integration | Auto-conversion of dbt schema.yml files at startup |
| MCP Integration | Claude Agent SDK compatible MCP server for tool invocation |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Kova AI Agent Container                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│  │   Skills Layer  │    │   MCP Server    │    │   Data Platform Client  │  │
│  │                 │    │  (data-catalog) │    │                         │  │
│  │  • SKILL.md     │◄──►│                 │◄──►│  TrinoClient            │  │
│  │  • QUERIES.md   │    │  8 Tools:       │    │  • testConnection()    │  │
│  │  • SECURITY.md  │    │  • search_tables│    │  • query<T>()          │  │
│  │                 │    │  • get_schema   │    │  • getCatalogs()       │  │
│  └─────────────────┘    │  • list_domains │    │  • getSchemas()        │  │
│                         │  • etc...       │    │  • getTables()         │  │
│                         └────────┬────────┘    └───────────┬─────────────┘  │
│                                  │                         │                │
│                                  ▼                         │                │
│                    ┌─────────────────────────┐             │                │
│                    │    Metadata Catalog     │             │                │
│                    │                         │             │                │
│                    │  ┌───────────────────┐  │             │                │
│                    │  │ MiniSearch Index  │  │             │                │
│                    │  │ (in-memory fuzzy) │  │             │                │
│                    │  └───────────────────┘  │             │                │
│                    │                         │             │                │
│                    │  ┌───────────────────┐  │             │                │
│                    │  │   Metadata Loader │  │             │                │
│                    │  │  • YAML sources/  │  │             │                │
│                    │  │  • dbt converter  │  │             │                │
│                    │  └───────────────────┘  │             │                │
│                    └─────────────────────────┘             │                │
│                                                            │                │
└────────────────────────────────────────────────────────────┼────────────────┘
                                                             │
                                                             ▼
                                               ┌─────────────────────────────┐
                                               │    Starburst Galaxy/Trino   │
                                               │                             │
                                               │  • prod_dbt_lake catalog    │
                                               │  • dbt_core_models schema   │
                                               │  • market_insights tables   │
                                               │  • inventory tables         │
                                               │  • fulfillment tables       │
                                               └─────────────────────────────┘
```

---

## Components

### Data Source Clients

Located in `packages/agent/src/data-platform/clients/`

#### Base Interface (`base.ts`)

Defines the abstract interface for all data source implementations:

```typescript
interface DataSourceClient {
  readonly config: DataSourceConfig;
  testConnection(): Promise<ConnectionTestResult>;
  query<T>(sql: string, params?: unknown[], options?: QueryOptions): Promise<QueryResult<T>>;
  getCatalogs(): Promise<string[]>;
  getSchemas(catalog?: string): Promise<string[]>;
  getTables(catalog?: string, schema?: string): Promise<string[]>;
  getColumns(table: string, catalog?: string, schema?: string): Promise<ColumnInfo[]>;
}
```

#### Trino Client (`trino.ts`)

Production implementation for Starburst Galaxy:

| Feature | Description |
|---------|-------------|
| Authentication | BasicAuth with configurable credentials |
| SSL | Automatic HTTPS for Galaxy (port 443) |
| Query Execution | Async iterator pattern for streaming results |
| Parameterization | Safe parameter substitution with escaping |
| Error Handling | Custom `DataSourceError` with error codes |

```typescript
// Client initialization pattern
const client = new TrinoClient({
  type: "trino",
  host: process.env.DATA_PLATFORM_HOST,
  port: 443,
  user: process.env.DATA_PLATFORM_USER,
  password: process.env.DATA_PLATFORM_PASSWORD,
  catalog: "prod_dbt_lake",
  schema: "dbt_core_models",
  ssl: true,
});
```

---

### Metadata Catalog

Located in `packages/agent/src/data-platform/metadata/`

#### Type Definitions (`types.ts`)

Core types for the metadata system:

```typescript
// Data tier classification
type DataTier = "RAW" | "STG" | "INT" | "MART";

// Table metadata structure
interface TableMetadata {
  name: string;
  description: string;
  tier: DataTier;
  domain: string;
  columns: ColumnMetadata[];
  sampleQueries?: SampleQuery[];
  relatedTables?: string[];
  tags?: string[];
}

// Full table details (after indexing)
interface TableDetails extends TableMetadata {
  fullPath: string;        // catalog.schema.table
  schemaName: string;
  catalogName: string;
  dataSourceId: string;
  dataSourceName: string;
}
```

#### Metadata Loader (`loader.ts`)

Singleton pattern for loading and caching metadata:

1. **Native Sources** - YAML files in `metadata/sources/`
2. **dbt Auto-Conversion** - Schema files in `metadata/dbt/`

```
Startup Flow:
1. Check if catalog already loaded (singleton)
2. Load native YAML from sources/
3. Auto-convert dbt files from dbt/
4. Build Map<string, TableDetails>
5. Return cached catalog
```

#### dbt Converter (`dbt-converter.ts`)

Automatic conversion of dbt schema.yml files:

| Inference | Pattern | Example |
|-----------|---------|---------|
| Tier | Model prefix | `mrt_*` → MART, `int_*` → INT |
| Domain | Name segment | `mrt_market_insights__*` → `market_insights` |
| Column types | Naming patterns | `*_at` → timestamp, `*_amount` → decimal |

#### Search Engine (`search.ts`)

MiniSearch-powered fuzzy search with field boosting:

```typescript
// Field weights for relevance scoring
const boosts = {
  name: 3,              // Table name most important
  description: 2,       // Description second
  domain: 1.5,          // Domain helps relevance
  tags: 1.5,            // Tags help relevance
  columnNames: 1,       // Column names useful
  columnDescriptions: 0.5  // Lowest weight
};
```

Features:
- Fuzzy matching (0.2 tolerance)
- Prefix matching enabled
- MART tables boosted in results
- Filter by domain, tier, sample queries
- Column search across all tables

---

### MCP Server

Located in `packages/agent/src/data-platform/mcp-server/server.ts`

Built using Claude Agent SDK's `createSdkMcpServer`:

```typescript
export const dataCatalogMcpServer = createSdkMcpServer({
  name: "data-catalog",
  version: "1.0.0",
  tools: [/* 8 tools */],
});
```

#### Available Tools

| Tool | Purpose | Parameters |
|------|---------|------------|
| `search_tables` | Find tables by keywords | `query`, `domain?`, `tier?`, `limit?` |
| `get_table_schema` | Get full column definitions | `table_path` |
| `get_sample_queries` | Get example SQL | `table_path` |
| `list_domains` | Overview of data domains | (none) |
| `get_connection_template` | Code generation patterns | (none) |
| `suggest_tables` | Use-case based recommendations | `use_case`, `limit?` |
| `get_related_tables` | Find related tables | `table_path`, `limit?` |
| `search_columns` | Find columns across tables | `query`, `domain?`, `limit?` |

#### Tool Output Format

All tools return formatted markdown for readability:

```typescript
// Example: formatSearchResults()
`## search_term_volume (MART)
**Full Path:** prod_dbt_lake.dbt_core_models.mrt_market_insights__search_term_volume
**Domain:** market_insights
**Description:** Search term volume data for marketplace analysis
**Relevance:** 95%`
```

---

### Skills Integration

Located in `packages/agent/src/skills/data-platform/`

Three documentation files guide AI agent behavior:

#### SKILL.md
- Entry point for skill discovery
- MCP tool reference table
- Workflow diagram
- Critical warnings about .env files

#### QUERIES.md
- Trino client setup code
- Server function patterns
- TypeScript type patterns
- TanStack Query integration

#### SECURITY.md
- SQL injection prevention (critical)
- Sanitization utilities
- Input validation patterns
- Safe vs unsafe code examples

---

## Data Flow

### Discovery Flow

```
Agent Request: "Build app showing marketplace revenue"
         │
         ▼
┌────────────────────────────────────┐
│  MCP: search_tables("revenue")     │
│  Returns: ranked table matches     │
└─────────────────┬──────────────────┘
                  │
                  ▼
┌────────────────────────────────────┐
│  MCP: get_table_schema(table_path) │
│  Returns: columns, types, desc     │
└─────────────────┬──────────────────┘
                  │
                  ▼
┌────────────────────────────────────┐
│  MCP: get_connection_template()    │
│  Returns: code patterns            │
└─────────────────┬──────────────────┘
                  │
                  ▼
┌────────────────────────────────────┐
│  Agent generates:                  │
│  • src/server/data/revenue.ts      │
│  • src/types/data/revenue.ts       │
└────────────────────────────────────┘
```

### Query Execution Flow

```
User Action → React Component → TanStack Query Hook
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │  TanStack Start Server Function │
                    │  (runs server-side)             │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │  TrinoClient.query()            │
                    │  • Sanitize inputs              │
                    │  • Execute via trino-client     │
                    │  • Map results to types         │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │  Starburst Galaxy               │
                    │  • Execute Trino SQL            │
                    │  • Return columnar data         │
                    └─────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Metadata as First-Class Citizen

**Decision:** Maintain a curated metadata catalog separate from live schema introspection.

**Rationale:**
- Business context (descriptions) not available in system catalogs
- Pre-indexed search enables sub-millisecond discovery
- Sample queries provide working code patterns
- dbt integration preserves existing documentation

### 2. MCP Server Pattern

**Decision:** Use Claude Agent SDK's MCP server for tool exposure.

**Rationale:**
- Native integration with Claude agents
- Structured tool definitions with Zod schemas
- Consistent error handling
- Version-controlled API surface

### 3. Singleton Metadata Catalog

**Decision:** Load metadata once at startup, cache in memory.

**Rationale:**
- Metadata changes infrequently
- Eliminates per-request I/O
- MiniSearch indexing is one-time cost
- Memory footprint is minimal (~MB)

### 4. dbt Auto-Conversion

**Decision:** Convert dbt schema.yml files at runtime rather than pre-converting.

**Rationale:**
- Zero friction to add new tables (copy file, restart)
- Leverages existing dbt documentation
- Intelligent tier/domain inference
- No build step required

### 5. Security by Documentation

**Decision:** Provide sanitization utilities and document patterns rather than enforcing at framework level.

**Rationale:**
- Generated code must work with any input pattern
- Trino doesn't support parameterized queries
- Developer must understand security tradeoffs
- SECURITY.md is always referenced in workflow

---

## Security Considerations

### SQL Injection Prevention

The system provides but does not enforce sanitization:

```typescript
// MUST be used for any user input in queries
function sanitizeForTrino(value: string): string {
  return value
    .replace(/'/g, "''")           // Escape quotes
    .replace(/[\\\/*;\-\-]/g, '')  // Remove metacharacters
    .slice(0, 500);                // Limit length
}

function validateStringInput(value: unknown, maxLength = 200): string {
  // Type validation
  // Trim whitespace
  // Length enforcement
}
```

### Credential Management

**Critical:** Container has pre-configured credentials via environment variables:

| Variable | Description |
|----------|-------------|
| `DATA_PLATFORM_HOST` | Starburst Galaxy hostname |
| `DATA_PLATFORM_USER` | Service account username |
| `DATA_PLATFORM_PASSWORD` | Service account password |

⚠️ **NEVER create `.env` files with these variables** - they override container credentials with placeholders.

### Read-Only Access

The connection is read-only. INSERT/UPDATE/DELETE statements will fail at the database level.

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATA_PLATFORM_HOST` | Yes | Starburst Galaxy host |
| `DATA_PLATFORM_USER` | Yes | Authentication username |
| `DATA_PLATFORM_PASSWORD` | Yes | Authentication password |
| `METADATA_SOURCES_PATH` | No | Override sources directory |
| `METADATA_DBT_PATH` | No | Override dbt directory |

### dbt Configuration

`metadata/dbt/dbt-config.yaml`:

```yaml
catalog: prod_dbt_lake
schema: dbt_core_models
dataSourceId: starburst-galaxy
dataSourceName: Spreetail Data Platform
```

---

## Usage Patterns

### Pattern 1: Simple Read-Only Query

```typescript
export const getTopSearchTerms = createServerFn({ method: 'GET' })
  .handler(async () => {
    const client = createTrinoClient();
    const result = await client.query<SearchTermVolume>(`
      SELECT search_term, total_volume, asin_count
      FROM prod_dbt_lake.dbt_core_models.mrt_market_insights__search_term_volume
      WHERE date >= current_date - interval '30' day
      ORDER BY total_volume DESC
      LIMIT 100
    `);
    return result.data;
  });
```

### Pattern 2: Query with User Input

```typescript
export const searchProducts = createServerFn({ method: 'GET' })
  .inputValidator((input: string) => validateStringInput(input, 200))
  .handler(async ({ data: searchTerm }) => {
    const sanitized = sanitizeForTrino(searchTerm);
    const client = createTrinoClient();
    
    const result = await client.query<Product>(`
      SELECT asin, title, price, category
      FROM prod_dbt_lake.dbt_core_models.mrt_products
      WHERE title LIKE '%${sanitized}%'
      LIMIT 50
    `);
    return result.data;
  });
```

### Pattern 3: Aggregation with Filters

```typescript
export const getCategoryMetrics = createServerFn({ method: 'GET' })
  .inputValidator((input: { category: string }) => ({
    category: validateAllowlist(
      input.category,
      ['Electronics', 'Home', 'Sports'],
      'category'
    )
  }))
  .handler(async ({ data: { category } }) => {
    const client = createTrinoClient();
    
    const result = await client.query<CategoryMetrics>(`
      SELECT
        category,
        SUM(revenue) as total_revenue,
        COUNT(DISTINCT asin) as product_count,
        AVG(margin) as avg_margin
      FROM prod_dbt_lake.dbt_core_models.mrt_product_metrics
      WHERE category = '${sanitizeForTrino(category)}'
      GROUP BY category
    `);
    return result.data[0];
  });
```

---

## Extending the System

### Adding a New Data Source Type

1. Create client in `clients/`:
   ```typescript
   // clients/postgres.ts
   export class PostgresClient implements DataSourceClient {
     // Implement interface methods
   }
   ```

2. Export from `clients/index.ts`

3. Update `types.ts` to include new type:
   ```typescript
   type: "trino" | "postgres" | "bigquery" | "snowflake"
   ```

### Adding Table Metadata

**Option A: Native YAML**
```yaml
# metadata/sources/new-source.yaml
id: new-source
name: New Data Source
type: trino
catalogs:
  - name: catalog_name
    schemas:
      - name: schema_name
        tier: MART
        domain: new_domain
        tables:
          - name: table_name
            description: Detailed description
            columns:
              - name: column1
                type: varchar
                description: Column description
```

**Option B: Drop dbt File**
```
metadata/dbt/
└── new_domain/
    └── schema.yml   # Standard dbt schema file
```

### Adding MCP Tools

1. Add tool definition in `mcp-server/server.ts`:
   ```typescript
   tool(
     "new_tool_name",
     "Description of what the tool does",
     { /* Zod schema */ },
     async (args) => {
       // Implementation
       return { content: [{ type: "text", text: result }] };
     }
   )
   ```

2. Update `SKILL.md` tool reference table

---

## Appendix

### File Structure

```
packages/agent/src/data-platform/
├── index.ts                    # Module entry point & exports
├── clients/
│   ├── index.ts               # Client exports
│   ├── base.ts                # Abstract interface
│   └── trino.ts               # Starburst/Trino implementation
├── metadata/
│   ├── index.ts               # Metadata exports
│   ├── types.ts               # TypeScript types
│   ├── loader.ts              # YAML loading & caching
│   ├── search.ts              # MiniSearch integration
│   ├── dbt-converter.ts       # dbt → native conversion
│   ├── README.md              # Metadata documentation
│   └── dbt/                   # dbt schema files
└── mcp-server/
    ├── index.ts               # MCP exports
    └── server.ts              # Tool definitions

packages/agent/src/skills/data-platform/
├── SKILL.md                   # Agent skill entry point
├── QUERIES.md                 # Query patterns & templates
└── SECURITY.md                # Security guidelines
```

**Note:** Skills are bundled in `@kova/agent` and copied to project directories at runtime via `ensureSkillsInProject()` in `packages/agent/src/core/query.ts`.

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `trino-client` | ^0.2.1 | Trino/Starburst connectivity |
| `minisearch` | ^6.x | Fuzzy full-text search |
| `yaml` | ^2.x | YAML parsing |
| `zod` | ^3.x | Schema validation |
| `@anthropic-ai/claude-agent-sdk` | ^0.x | MCP server creation |
