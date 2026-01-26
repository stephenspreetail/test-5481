/**
 * Data Platform Client Factory
 *
 * Provides a unified interface for creating data source clients
 * across different platforms (Trino, PostgreSQL, etc.)
 */

export * from "./base.js";
export * from "./trino.js";

import type { DataSourceClient, DataSourceConfig } from "./base.js";
import { DataSourceError } from "./base.js";
import { TrinoClient, createTrinoClientFromEnv } from "./trino.js";

/**
 * Factory function to create a data source client based on configuration
 *
 * @param config - Data source configuration
 * @returns Configured data source client
 */
export function createDataSourceClient(
  config: DataSourceConfig
): DataSourceClient {
  switch (config.type) {
    case "trino":
      return new TrinoClient(config as DataSourceConfig & { type: "trino" });

    case "postgres":
      // TODO: Implement PostgreSQL client
      throw new DataSourceError(
        "PostgreSQL client not yet implemented",
        "NOT_IMPLEMENTED",
        config.id
      );

    case "bigquery":
      // TODO: Implement BigQuery client
      throw new DataSourceError(
        "BigQuery client not yet implemented",
        "NOT_IMPLEMENTED",
        config.id
      );

    case "snowflake":
      // TODO: Implement Snowflake client
      throw new DataSourceError(
        "Snowflake client not yet implemented",
        "NOT_IMPLEMENTED",
        config.id
      );

    default:
      throw new DataSourceError(
        `Unknown data source type: ${(config as DataSourceConfig).type}`,
        "UNKNOWN_TYPE",
        config.id
      );
  }
}

/**
 * Create the default data platform client from environment variables
 *
 * This is the primary entry point for accessing Spreetail's Data Platform.
 * It reads configuration from environment variables and returns a configured client.
 */
export function createDataPlatformClient(): DataSourceClient {
  // Currently only Trino/Starburst is supported
  return createTrinoClientFromEnv();
}

/**
 * Registry of available data sources
 *
 * In the future, this could be populated from configuration files
 * or a database to support multiple data sources.
 */
const dataSourceRegistry = new Map<string, DataSourceClient>();

/**
 * Get or create a data source client by ID
 *
 * This provides a singleton pattern for data source clients,
 * ensuring we don't create multiple connections to the same source.
 */
export function getDataSourceClient(sourceId: string): DataSourceClient {
  let client = dataSourceRegistry.get(sourceId);

  if (!client) {
    // Currently only "starburst-galaxy" is supported
    if (sourceId === "starburst-galaxy") {
      client = createDataPlatformClient();
      dataSourceRegistry.set(sourceId, client);
    } else {
      throw new DataSourceError(
        `Unknown data source: ${sourceId}`,
        "UNKNOWN_SOURCE",
        sourceId
      );
    }
  }

  return client;
}

/**
 * Close all registered data source clients
 *
 * Call this during graceful shutdown to release resources.
 */
export async function closeAllDataSources(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  for (const [id, client] of dataSourceRegistry) {
    console.log(`[DataPlatform] Closing connection to ${id}`);
    closePromises.push(client.close());
  }

  await Promise.all(closePromises);
  dataSourceRegistry.clear();
}
