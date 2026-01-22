/**
 * Base interface for data source clients
 *
 * Provides a common abstraction for querying different data platforms
 * (Trino/Starburst, PostgreSQL, BigQuery, etc.)
 */

/**
 * Result of a connection test
 */
export interface ConnectionTestResult {
  connected: boolean;
  error?: string;
  latencyMs?: number;
}

/**
 * Query execution options
 */
export interface QueryOptions {
  /** Query timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum number of rows to return */
  limit?: number;
  /** Catalog to use (for Trino) */
  catalog?: string;
  /** Schema to use */
  schema?: string;
}

/**
 * Query result metadata
 */
export interface QueryResultMetadata {
  /** Number of rows returned */
  rowCount: number;
  /** Column names */
  columns: string[];
  /** Query execution time in milliseconds */
  executionTimeMs: number;
  /** Whether results were truncated */
  truncated: boolean;
}

/**
 * Query result with data and metadata
 */
export interface QueryResult<T = Record<string, unknown>> {
  data: T[];
  metadata: QueryResultMetadata;
}

/**
 * Configuration for connecting to a data source
 */
export interface DataSourceConfig {
  /** Unique identifier for this data source */
  id: string;
  /** Human-readable name */
  name: string;
  /** Type of data source */
  type: "trino" | "postgres" | "bigquery" | "snowflake";
  /** Host address */
  host: string;
  /** Port number */
  port: number;
  /** Username for authentication */
  user: string;
  /** Password for authentication */
  password: string;
  /** Default catalog (for Trino) */
  catalog?: string;
  /** Default schema */
  schema?: string;
  /** SSL/TLS configuration */
  ssl?: boolean;
  /** Additional connection options */
  options?: Record<string, unknown>;
}

/**
 * Abstract interface for data source clients
 *
 * All data source implementations must implement this interface
 * to ensure consistent behavior across different platforms.
 */
export interface DataSourceClient {
  /**
   * Get the configuration for this client
   */
  readonly config: DataSourceConfig;

  /**
   * Test the connection to the data source
   */
  testConnection(): Promise<ConnectionTestResult>;

  /**
   * Execute a query and return results
   *
   * @param sql - SQL query to execute
   * @param params - Optional query parameters for parameterized queries
   * @param options - Query execution options
   */
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
    options?: QueryOptions
  ): Promise<QueryResult<T>>;

  /**
   * Get available catalogs (for Trino) or databases
   */
  getCatalogs(): Promise<string[]>;

  /**
   * Get available schemas in a catalog/database
   */
  getSchemas(catalog?: string): Promise<string[]>;

  /**
   * Get available tables in a schema
   */
  getTables(catalog?: string, schema?: string): Promise<string[]>;

  /**
   * Get column information for a table
   */
  getColumns(
    table: string,
    catalog?: string,
    schema?: string
  ): Promise<ColumnInfo[]>;

  /**
   * Close the connection and release resources
   */
  close(): Promise<void>;
}

/**
 * Column information from database metadata
 */
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  comment?: string;
}

/**
 * Error thrown by data source clients
 */
export class DataSourceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly source: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "DataSourceError";
  }
}
