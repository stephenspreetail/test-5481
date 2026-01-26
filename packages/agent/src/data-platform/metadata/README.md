# Data Platform Metadata Catalog

This directory contains the metadata catalog for Spreetail's Data Platform. The catalog enables Kova's AI agent to discover, understand, and generate code for data platform tables.

## Overview

The metadata catalog provides:
- **Table Discovery**: Search tables by keywords, domain, or tier
- **Schema Information**: Column names, types, and descriptions
- **Sample Queries**: Pre-built SQL patterns for common use cases
- **Code Generation**: Templates for TanStack Start server functions

## Architecture

```
metadata/
├── sources/                    # Native YAML metadata files
│   └── starburst-galaxy.yaml   # Manually curated table definitions
├── dbt/                        # dbt schema files (auto-converted)
│   ├── dbt-config.yaml         # Galaxy catalog/schema mapping
│   └── *.yml                   # Drop dbt files here
├── dbt-converter.ts            # Converts dbt → native format at init
├── loader.ts                   # Loads and indexes all metadata
├── search.ts                   # MiniSearch-powered fuzzy search
├── types.ts                    # TypeScript type definitions
└── index.ts                    # Public API exports
```

## Adding Tables

### Option 1: Drop dbt Files (Recommended)

The easiest way to add tables is to copy dbt `schema.yml` files directly:

```bash
# Copy from your local dbt-poc clone
cp ~/repos/dbt-poc/models/marts/market_insights/*.yml \
   data-platform/metadata/dbt/market_insights/

# Or sync from GitLab
# Option 1: Sparse checkout (downloads only the directory you need)
git clone --depth=1 --filter=blob:none --sparse \
  git@gitlab.com:spreetail/data-architecture/dbt-poc.git /tmp/dbt-poc
git -C /tmp/dbt-poc sparse-checkout set models/marts/inventory
cp -r /tmp/dbt-poc/models/marts/inventory/* data-platform/metadata/dbt/
rm -rf /tmp/dbt-poc

# Option 2: Simple shallow clone (if sparse checkout not available)
git clone --depth=1 --no-checkout \
  git@gitlab.com:spreetail/data-architecture/dbt-poc.git /tmp/dbt-poc
git -C /tmp/dbt-poc checkout HEAD -- models/marts/inventory
cp -r /tmp/dbt-poc/models/marts/inventory/* data-platform/metadata/dbt/
rm -rf /tmp/dbt-poc

# Option 3: GitLab API (requires GITLAB_TOKEN env var)
# curl --header "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
#   "https://gitlab.com/api/v4/projects/spreetail%2Fdata-architecture%2Fdbt-poc/repository/archive.tar.gz?sha=HEAD&path=models/marts/inventory" \
#   | tar -xz --strip-components=1 -C data-platform/metadata/dbt/
```

**Directory structure** (organize however you like):
```
dbt/
├── dbt-config.yaml
├── market_insights/
│   ├── forecast.yml
│   └── exceptions.yml
└── inventory/
    └── stock_levels.yml
```

**What happens at startup:**
1. Loader scans `dbt/` for `.yml` files
2. Parses dbt model definitions
3. Infers tier from prefix (`mrt_` → MART, `int_` → INT, etc.)
4. Infers domain from model name (`mrt_market_insights__*` → `market_insights`)
5. Infers column types from naming patterns
6. Generates basic sample queries
7. Indexes everything for search

### Option 2: Native YAML

For tables that need custom sample queries or richer metadata, use native YAML in `sources/`:

```yaml
# sources/starburst-galaxy.yaml
id: starburst-galaxy
name: Spreetail Data Platform
type: trino

catalogs:
  - name: prod_dbt_lake
    schemas:
      - name: dbt_core_models
        tier: MART
        domain: market_insights
        tables:
          - name: mrt_market_insights__adjusted_purchase_volume_forecast
            description: |
              Purchase volume forecasts for Amazon ASINs...
            tier: MART
            domain: market_insights
            updateFrequency: weekly
            columns:
              - name: asin
                type: varchar
                description: Amazon Standard Identification Number
              - name: adjusted_purchase_vol_forecast
                type: double
                description: Price-adjusted purchase volume forecast
            sampleQueries:
              - description: Get top ASINs by volume
                useCase: Market opportunity analysis
                sql: |
                  SELECT asin, title, adjusted_purchase_vol_forecast
                  FROM prod_dbt_lake.dbt_core_models.mrt_market_insights__adjusted_purchase_volume_forecast
                  ORDER BY adjusted_purchase_vol_forecast DESC
                  LIMIT 100
            tags:
              - forecast
              - amazon
```

## Configuration

### dbt Config (`dbt/dbt-config.yaml`)

Maps dbt models to Starburst Galaxy:

```yaml
# Starburst Galaxy catalog name
catalog: prod_dbt_lake

# Starburst Galaxy schema name
schema: dbt_core_models

# Internal identifiers
dataSourceId: starburst-galaxy
dataSourceName: Spreetail Data Platform
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `METADATA_SOURCES_PATH` | Path to native YAML files | `./sources` |
| `METADATA_DBT_PATH` | Path to dbt files | `./dbt` |

## How the AI Agent Uses Metadata

The metadata powers these MCP tools available to the Kova agent:

| Tool | Purpose |
|------|---------|
| `search_tables` | Find tables by keywords (uses MiniSearch fuzzy matching) |
| `get_table_schema` | Get full column details for a table |
| `get_sample_queries` | Get pre-built SQL patterns |
| `list_domains` | List available data domains |
| `suggest_tables` | Recommend tables for a use case |
| `get_related_tables` | Find tables related to a given table |
| `search_columns` | Search for columns across all tables |
| `get_connection_template` | Get Trino connection code template |

### Example Agent Interaction

```
User: "Build me a dashboard showing purchase volume forecasts"

Agent:
1. Calls search_tables("purchase volume forecast")
   → Finds mrt_market_insights__adjusted_purchase_volume_forecast

2. Calls get_table_schema("prod_dbt_lake.dbt_core_models.mrt_market_insights__adjusted_purchase_volume_forecast")
   → Gets column definitions

3. Calls get_sample_queries(...)
   → Gets SQL patterns

4. Generates server function and React component using the metadata
```

## Naming Conventions

### Tier Detection (from model name prefix)

| Prefix | Tier | Description |
|--------|------|-------------|
| `mrt_` or `mart_` | MART | Production-ready analytics |
| `int_` | INT | Intermediate transformations |
| `stg_` | STG | Staged/cleaned data |
| `raw_` | RAW | Raw ingested data |

### Domain Detection (from model name)

Pattern: `{prefix}_{domain}__{table_name}`

Examples:
- `mrt_market_insights__forecast` → domain: `market_insights`
- `int_inventory__stock_levels` → domain: `inventory`
- `stg_fulfillment__shipments` → domain: `fulfillment`

### Column Type Inference

| Pattern | Inferred Type |
|---------|---------------|
| `*_at`, `*_timestamp` | `timestamp` |
| `*_date`, `date` | `date` |
| `*_id`, `id` | `varchar` |
| `*_count`, `*_num` | `bigint` |
| `*_amount`, `*_price`, `*_revenue` | `decimal(18,2)` |
| `is_*`, `has_*` | `boolean` |
| `*_pct`, `*_rate`, `*_share` | `double` |
| `*_position`, `*_rank` | `integer` |
| (default) | `varchar` |

## Search Features

The catalog uses [MiniSearch](https://lucaong.github.io/minisearch/) for fuzzy full-text search:

- **Fuzzy matching**: Finds results even with typos
- **Prefix matching**: Partial words work (`fore` matches `forecast`)
- **Field boosting**: Table names weighted 3x, descriptions 2x
- **Tier boosting**: MART tables ranked higher than INT/STG/RAW

## Testing

Verify metadata loads correctly:

```bash
# Quick test
npx tsx -e "
import { loadMetadataCatalog, getAllTables } from './data-platform/metadata/index.js';
loadMetadataCatalog();
console.log('Tables:', getAllTables().map(t => t.fullPath));
"
```

## Troubleshooting

### Tables not appearing

1. Check file extension is `.yml` or `.yaml`
2. Verify dbt file has `version: 2` and `models:` array
3. Check logs for parsing errors at startup

### Wrong catalog/schema path

Edit `dbt/dbt-config.yaml` to match your Galaxy setup:
```yaml
catalog: prod_dbt_lake      # Your catalog
schema: dbt_core_models     # Your schema
```

### Search not finding tables

- Use specific keywords from table/column descriptions
- Try partial matches (prefix search is enabled)
- Check domain filter if results seem filtered

## Contributing

When adding new tables:

1. **Prefer dbt files** for standard tables
2. **Use native YAML** when you need:
   - Custom sample queries with specific use cases
   - Richer descriptions than dbt provides
   - Related table relationships
   - Custom tags for categorization

3. **Test locally** before committing:
   ```bash
   npm run build && npm run dev
   ```
