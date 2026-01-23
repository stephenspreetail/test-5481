/**
 * dbt Schema Converter
 *
 * Converts dbt schema.yml files to our metadata catalog format at runtime.
 * Drop dbt files into data-platform/metadata/dbt/ and they'll be auto-loaded.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  DataSourceMetadata,
  TableMetadata,
  ColumnMetadata,
  SampleQuery,
  DataTier,
} from "./types.js";

/**
 * dbt schema.yml types
 */
interface DbtColumn {
  name: string;
  description?: string;
  data_type?: string;
  tests?: unknown[];
}

interface DbtModel {
  name: string;
  description?: string;
  config?: {
    tags?: string[];
    materialized?: string;
  };
  columns?: DbtColumn[];
}

interface DbtSchema {
  version: number;
  models?: DbtModel[];
}

/**
 * Configuration for dbt-to-metadata conversion
 */
export interface DbtConfig {
  /** Starburst Galaxy catalog name */
  catalog: string;
  /** Starburst Galaxy schema name */
  schema: string;
  /** Data source ID */
  dataSourceId: string;
  /** Data source display name */
  dataSourceName: string;
}

/**
 * Default config - can be overridden via dbt-config.yaml
 */
const DEFAULT_DBT_CONFIG: DbtConfig = {
  catalog: "prod_dbt_lake",
  schema: "dbt_core_models",
  dataSourceId: "starburst-galaxy",
  dataSourceName: "Spreetail Data Platform",
};

/**
 * Infer tier from dbt model name prefix
 */
function inferTier(modelName: string): DataTier {
  const lowerName = modelName.toLowerCase();
  if (lowerName.startsWith("mrt_") || lowerName.startsWith("mart_")) return "MART";
  if (lowerName.startsWith("int_")) return "INT";
  if (lowerName.startsWith("stg_")) return "STG";
  if (lowerName.startsWith("raw_")) return "RAW";
  return "MART";
}

/**
 * Infer domain from dbt model name
 * e.g., mrt_market_insights__table_name -> market_insights
 */
function inferDomain(modelName: string): string {
  // Pattern: prefix_domain__table_name
  const parts = modelName.split("__");
  if (parts.length >= 2) {
    // Remove tier prefix (mrt_, int_, stg_, raw_)
    const firstPart = parts[0].replace(/^(mrt|mart|int|stg|raw)_/i, "");
    if (firstPart) return firstPart;
  }
  return "general";
}

/**
 * Infer column type from dbt column definition or name patterns
 */
function inferColumnType(column: DbtColumn): string {
  if (column.data_type) return column.data_type;

  const name = column.name.toLowerCase();

  // Timestamp patterns
  if (name.endsWith("_at") || name.endsWith("_timestamp") || name === "created_at" || name === "updated_at") {
    return "timestamp";
  }
  // Date patterns
  if (name.endsWith("_date") || name === "date" || name.startsWith("date_")) {
    return "date";
  }
  // ID patterns
  if (name.endsWith("_id") || name === "id" || name.endsWith("_uuid")) {
    return "varchar";
  }
  // Count patterns
  if (name.endsWith("_count") || name.endsWith("_num") || name === "count" || name.startsWith("num_")) {
    return "bigint";
  }
  // Money/decimal patterns
  if (name.endsWith("_amount") || name.endsWith("_price") || name.endsWith("_revenue") ||
      name.endsWith("_cost") || name.endsWith("_total") || name.endsWith("_sum")) {
    return "decimal(18,2)";
  }
  // Boolean patterns
  if (name.startsWith("is_") || name.startsWith("has_") || name.startsWith("can_") || name.startsWith("should_")) {
    return "boolean";
  }
  // Percentage/rate patterns
  if (name.endsWith("_pct") || name.endsWith("_rate") || name.endsWith("_share") ||
      name.endsWith("_ratio") || name.endsWith("_forecast") || name.endsWith("_pred")) {
    return "double";
  }
  // Position/rank patterns
  if (name.endsWith("_position") || name.endsWith("_rank") || name.endsWith("_stage")) {
    return "integer";
  }

  return "varchar";
}

/**
 * Convert a dbt model to our table metadata format
 */
function convertDbtModel(model: DbtModel, config: DbtConfig): TableMetadata {
  const tier = inferTier(model.name);
  const domain = inferDomain(model.name);

  const columns: ColumnMetadata[] = (model.columns || []).map((col) => ({
    name: col.name,
    type: inferColumnType(col),
    description: col.description || `Column: ${col.name}`,
  }));

  // Generate a basic sample query
  const sampleQueries: SampleQuery[] = [];
  if (columns.length > 0) {
    const selectCols = columns.slice(0, 5).map((c) => c.name).join(",\n    ");
    const fullTablePath = `${config.catalog}.${config.schema}.${model.name}`;

    sampleQueries.push({
      description: `Preview ${model.name} data`,
      sql: `SELECT\n    ${selectCols}\nFROM ${fullTablePath}\nLIMIT 100`,
      useCase: "Data exploration",
    });
  }

  return {
    name: model.name,
    description: model.description || `dbt model: ${model.name}`,
    tier,
    domain,
    columns,
    sampleQueries,
    tags: model.config?.tags,
  };
}

/**
 * Parse a dbt schema.yml file and convert to our table format
 */
function parseDbtSchemaFile(filePath: string, config: DbtConfig): TableMetadata[] {
  try {
    const content = readFileSync(filePath, "utf-8");
    const schema = parseYaml(content) as DbtSchema;

    if (!schema.models || schema.models.length === 0) {
      return [];
    }

    return schema.models.map((model) => convertDbtModel(model, config));
  } catch (error) {
    console.warn(
      `[DbtConverter] Failed to parse ${filePath}: ${error instanceof Error ? error.message : error}`
    );
    return [];
  }
}

/**
 * Load dbt config from dbt-config.yaml if it exists
 */
function loadDbtConfig(dbtPath: string): DbtConfig {
  const configPath = join(dbtPath, "dbt-config.yaml");

  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      const config = parseYaml(content) as Partial<DbtConfig>;
      return { ...DEFAULT_DBT_CONFIG, ...config };
    } catch (error) {
      console.warn(`[DbtConverter] Failed to load dbt-config.yaml: ${error}`);
    }
  }

  return DEFAULT_DBT_CONFIG;
}

/**
 * Find all dbt schema.yml files recursively
 */
function findDbtSchemaFiles(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findDbtSchemaFiles(fullPath));
    } else if (
      (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")) &&
      !entry.name.startsWith("dbt-config")
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Load all dbt files from a directory and convert to DataSourceMetadata
 */
export function loadDbtMetadata(dbtPath: string): DataSourceMetadata | null {
  if (!existsSync(dbtPath)) {
    return null;
  }

  const config = loadDbtConfig(dbtPath);
  const schemaFiles = findDbtSchemaFiles(dbtPath);

  if (schemaFiles.length === 0) {
    console.log(`[DbtConverter] No dbt schema files found in ${dbtPath}`);
    return null;
  }

  console.log(`[DbtConverter] Found ${schemaFiles.length} dbt schema files in ${dbtPath}`);

  // Parse all dbt files and collect tables
  const allTables: TableMetadata[] = [];

  for (const file of schemaFiles) {
    const tables = parseDbtSchemaFile(file, config);
    if (tables.length > 0) {
      console.log(`[DbtConverter]   ${basename(file)}: ${tables.length} model(s)`);
      allTables.push(...tables);
    }
  }

  if (allTables.length === 0) {
    return null;
  }

  // Group tables by domain
  const tablesByDomain = new Map<string, TableMetadata[]>();
  for (const table of allTables) {
    const existing = tablesByDomain.get(table.domain) || [];
    existing.push(table);
    tablesByDomain.set(table.domain, existing);
  }

  // Build the data source structure
  // All tables go into the same schema since that's how Galaxy is structured
  const dataSource: DataSourceMetadata = {
    id: `${config.dataSourceId}-dbt`,
    name: `${config.dataSourceName} (dbt)`,
    type: "trino",
    description: "Auto-converted from dbt schema.yml files",
    catalogs: [
      {
        name: config.catalog,
        description: "Production dbt data lake",
        schemas: [
          {
            name: config.schema,
            description: "dbt core models",
            tier: "MART",
            domain: "dbt",
            tables: allTables,
          },
        ],
      },
    ],
  };

  console.log(`[DbtConverter] Converted ${allTables.length} tables from dbt schemas`);

  return dataSource;
}
