/**
 * Trino/Starburst Galaxy Client Implementation
 *
 * Provides connectivity to Trino-compatible data platforms
 * including Starburst Galaxy and open-source Trino.
 */

import { Trino, BasicAuth } from "trino-client";
import type {
  DataSourceClient,
  DataSourceConfig,
  ConnectionTestResult,
  QueryOptions,
  QueryResult,
  ColumnInfo,
} from "./base.js";
import { DataSourceError } from "./base.js";

/**
 * Trino-specific configuration options
 */
export interface TrinoConfig extends DataSourceConfig {
  type: "trino";
  /** Source identifier for query tracking */
  source?: string;
  /** Extra credentials for authentication */
  extraCredentials?: Record<string, string>;
}

/**
 * Client for Trino and Starburst Galaxy
 */
export class TrinoClient implements DataSourceClient {
  private client: Trino;
  readonly config: TrinoConfig;

  constructor(config: TrinoConfig) {
    this.config = config;

    // Build the server URL
    const protocol = config.ssl ? "https" : "http";
    const server = `${protocol}://${config.host}:${config.port}`;

    // Initialize Trino client
    this.client = Trino.create({
      server,
      catalog: config.catalog,
      schema: config.schema,
      auth: new BasicAuth(config.user, config.password),
      source: config.source || "kova-data-platform",
      extraCredential: config.extraCredentials,
    });
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      // Simple query to test connectivity
      const result = await this.query<{ value: number }>("SELECT 1 AS value");

      if (result.data.length === 1 && result.data[0].value === 1) {
        return {
          connected: true,
          latencyMs: Date.now() - startTime,
        };
      }

      return {
        connected: false,
        error: "Unexpected query result",
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : "Unknown error",
        latencyMs: Date.now() - startTime,
      };
    }
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();

    try {
      // Handle parameterized queries by replacing ? with values
      let processedSql = sql;
      if (params && params.length > 0) {
        let paramIndex = 0;
        processedSql = sql.replace(/\?/g, () => {
          const param = params[paramIndex++];
          return this.escapeValue(param);
        });
      }

      // Apply limit if specified
      if (options?.limit && !processedSql.toLowerCase().includes("limit")) {
        processedSql = `${processedSql} LIMIT ${options.limit}`;
      }

      // Execute the query
      const queryIterator = await this.client.query(processedSql);

      const rows: T[] = [];
      let columns: string[] = [];
      let truncated = false;

      // Collect all results
      for await (const queryResult of queryIterator) {
        // Get column names from first result
        if (columns.length === 0 && queryResult.columns) {
          columns = queryResult.columns.map((col: { name: string; type: string }) => col.name);
        }

        // Add data rows
        if (queryResult.data) {
          for (const row of queryResult.data) {
            // Convert array row to object using column names
            const rowObject: Record<string, unknown> = {};
            columns.forEach((col: string, index: number) => {
              rowObject[col] = (row as unknown[])[index];
            });
            rows.push(rowObject as T);

            // Check limit
            if (options?.limit && rows.length >= options.limit) {
              truncated = true;
              break;
            }
          }
        }

        if (truncated) break;
      }

      return {
        data: rows,
        metadata: {
          rowCount: rows.length,
          columns,
          executionTimeMs: Date.now() - startTime,
          truncated,
        },
      };
    } catch (error) {
      throw new DataSourceError(
        error instanceof Error ? error.message : "Query execution failed",
        "QUERY_ERROR",
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async getCatalogs(): Promise<string[]> {
    const result = await this.query<{ Catalog: string }>("SHOW CATALOGS");
    return result.data.map((row) => row.Catalog);
  }

  async getSchemas(catalog?: string): Promise<string[]> {
    const targetCatalog = catalog || this.config.catalog;
    if (!targetCatalog) {
      throw new DataSourceError(
        "Catalog is required to list schemas",
        "MISSING_CATALOG",
        this.config.id
      );
    }

    const result = await this.query<{ Schema: string }>(
      `SHOW SCHEMAS FROM ${this.escapeIdentifier(targetCatalog)}`
    );
    return result.data.map((row) => row.Schema);
  }

  async getTables(catalog?: string, schema?: string): Promise<string[]> {
    const targetCatalog = catalog || this.config.catalog;
    const targetSchema = schema || this.config.schema;

    if (!targetCatalog || !targetSchema) {
      throw new DataSourceError(
        "Catalog and schema are required to list tables",
        "MISSING_CONTEXT",
        this.config.id
      );
    }

    const result = await this.query<{ Table: string }>(
      `SHOW TABLES FROM ${this.escapeIdentifier(targetCatalog)}.${this.escapeIdentifier(targetSchema)}`
    );
    return result.data.map((row) => row.Table);
  }

  async getColumns(
    table: string,
    catalog?: string,
    schema?: string
  ): Promise<ColumnInfo[]> {
    const targetCatalog = catalog || this.config.catalog;
    const targetSchema = schema || this.config.schema;

    if (!targetCatalog || !targetSchema) {
      throw new DataSourceError(
        "Catalog and schema are required to describe table",
        "MISSING_CONTEXT",
        this.config.id
      );
    }

    const fullTableName = `${this.escapeIdentifier(targetCatalog)}.${this.escapeIdentifier(targetSchema)}.${this.escapeIdentifier(table)}`;
    const result = await this.query<{
      Column: string;
      Type: string;
      Extra: string;
      Comment: string;
    }>(`DESCRIBE ${fullTableName}`);

    return result.data.map((row) => ({
      name: row.Column,
      type: row.Type,
      nullable: !row.Extra?.includes("NOT NULL"),
      comment: row.Comment || undefined,
    }));
  }

  async close(): Promise<void> {
    // Trino client doesn't maintain persistent connections
    // Nothing to close
  }

  /**
   * Escape a value for use in a SQL query
   */
  private escapeValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "NULL";
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "boolean") {
      return value ? "TRUE" : "FALSE";
    }
    if (value instanceof Date) {
      return `TIMESTAMP '${value.toISOString().replace("T", " ").replace("Z", "")}'`;
    }
    // String - escape single quotes
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  /**
   * Escape an identifier (table name, column name, etc.)
   */
  private escapeIdentifier(identifier: string): string {
    // Use double quotes for identifiers
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}

/**
 * Create a Trino client from environment variables
 *
 * Required environment variables:
 * - DATA_PLATFORM_HOST: Trino/Starburst host
 * - DATA_PLATFORM_USER: Username
 * - DATA_PLATFORM_PASSWORD: Password
 *
 * Optional environment variables:
 * - DATA_PLATFORM_PORT: Port (default: 443 for Starburst Galaxy)
 * - DATA_PLATFORM_SSL: Use SSL (default: true)
 */
export function createTrinoClientFromEnv(): TrinoClient {
  const host = process.env.DATA_PLATFORM_HOST;
  const user = process.env.DATA_PLATFORM_USER;
  const password = process.env.DATA_PLATFORM_PASSWORD;

  if (!host || !user || !password) {
    throw new DataSourceError(
      "Missing required environment variables: DATA_PLATFORM_HOST, DATA_PLATFORM_USER, DATA_PLATFORM_PASSWORD",
      "MISSING_CONFIG",
      "trino"
    );
  }

  return new TrinoClient({
    id: "starburst-galaxy",
    name: "Spreetail Data Platform",
    type: "trino",
    host,
    port: parseInt(process.env.DATA_PLATFORM_PORT || "443", 10),
    user,
    password,
    ssl: process.env.DATA_PLATFORM_SSL !== "false",
    source: "kova-app-builder",
  });
}
