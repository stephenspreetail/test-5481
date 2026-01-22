/**
 * TypeScript types for the Data Platform Metadata Catalog
 *
 * These types define the structure of YAML metadata files that
 * describe tables, columns, and relationships in the data platform.
 */

/**
 * Data tier classification
 * - RAW: Raw ingested data, minimal transformations
 * - STG: Staged data with basic cleaning
 * - INT: Intermediate data with business logic
 * - MART: Production-ready analytical data
 */
export type DataTier = "RAW" | "STG" | "INT" | "MART";

/**
 * Column definition in metadata
 */
export interface ColumnMetadata {
  /** Column name in the database */
  name: string;
  /** SQL data type (e.g., varchar, integer, date) */
  type: string;
  /** Human-readable description of the column */
  description: string;
  /** Whether the column can contain NULL values */
  nullable?: boolean;
  /** Primary key flag */
  primaryKey?: boolean;
  /** Foreign key reference (format: "schema.table.column") */
  foreignKey?: string;
  /** Example values for documentation */
  examples?: string[];
  /** Business domain this column belongs to */
  domain?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Sample query in metadata
 */
export interface SampleQuery {
  /** Human-readable description of what this query does */
  description: string;
  /** SQL query text */
  sql: string;
  /** Use case or scenario for this query */
  useCase?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Table definition in metadata
 */
export interface TableMetadata {
  /** Table name in the database */
  name: string;
  /** Human-readable description of the table */
  description: string;
  /** Data tier classification */
  tier: DataTier;
  /** Business domain this table belongs to */
  domain: string;
  /** Update frequency (e.g., "daily", "hourly", "real-time") */
  updateFrequency?: string;
  /** Owner team or person */
  owner?: string;
  /** Column definitions */
  columns: ColumnMetadata[];
  /** Sample queries demonstrating common use cases */
  sampleQueries?: SampleQuery[];
  /** Related tables (format: "schema.table") */
  relatedTables?: string[];
  /** Tags for categorization and search */
  tags?: string[];
  /** Approximate row count (for documentation) */
  approximateRows?: string;
  /** Data retention policy */
  retention?: string;
}

/**
 * Schema definition in metadata
 */
export interface SchemaMetadata {
  /** Schema name in the database */
  name: string;
  /** Human-readable description */
  description: string;
  /** Data tier for tables in this schema */
  tier: DataTier;
  /** Business domain */
  domain: string;
  /** Tables in this schema */
  tables: TableMetadata[];
}

/**
 * Catalog definition in metadata
 */
export interface CatalogMetadata {
  /** Catalog name (e.g., "data_lake") */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Schemas in this catalog */
  schemas: SchemaMetadata[];
}

/**
 * Data source definition in metadata
 */
export interface DataSourceMetadata {
  /** Unique identifier for this data source */
  id: string;
  /** Human-readable name */
  name: string;
  /** Type of data source */
  type: "trino" | "postgres" | "bigquery" | "snowflake";
  /** Description of this data source */
  description?: string;
  /** Catalogs available in this data source */
  catalogs: CatalogMetadata[];
}

/**
 * Search result for a table
 */
export interface TableSearchResult {
  /** Full table path (catalog.schema.table) */
  fullPath: string;
  /** Table name */
  tableName: string;
  /** Schema name */
  schemaName: string;
  /** Catalog name */
  catalogName: string;
  /** Data source ID */
  dataSourceId: string;
  /** Table description */
  description: string;
  /** Data tier */
  tier: DataTier;
  /** Business domain */
  domain: string;
  /** Search relevance score (0-1) */
  score: number;
  /** Matched terms that contributed to the score */
  matchedTerms: string[];
}

/**
 * Full table details including all metadata
 */
export interface TableDetails extends TableMetadata {
  /** Full table path (catalog.schema.table) */
  fullPath: string;
  /** Schema name */
  schemaName: string;
  /** Catalog name */
  catalogName: string;
  /** Data source ID */
  dataSourceId: string;
  /** Data source name */
  dataSourceName: string;
}

/**
 * Domain summary information
 */
export interface DomainSummary {
  /** Domain name */
  name: string;
  /** Description */
  description?: string;
  /** Number of tables in this domain */
  tableCount: number;
  /** Data tiers available in this domain */
  tiers: DataTier[];
  /** Example tables */
  exampleTables: string[];
}

/**
 * Connection template for code generation
 */
export interface ConnectionTemplate {
  /** Data source type */
  type: "trino" | "postgres" | "bigquery" | "snowflake";
  /** Import statements needed */
  imports: string[];
  /** Connection code template */
  connectionCode: string;
  /** Query execution code template */
  queryCode: string;
  /** Environment variables needed */
  envVars: string[];
  /** Note about environment variables (e.g., "pre-configured in container") */
  envNote?: string;
}
