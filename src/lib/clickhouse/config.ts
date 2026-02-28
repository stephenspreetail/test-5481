/**
 * ClickHouse Cloud configuration
 * Reads connection settings from environment variables.
 * This module runs ONLY on the server (Nitro runtime).
 */

export interface ClickHouseConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  secure: boolean
  requestTimeout: number
  maxRetries: number
}

/**
 * Reads and validates ClickHouse configuration from environment variables.
 * Throws descriptive errors if required variables are missing.
 */
export function getClickHouseConfig(): ClickHouseConfig {
  const host = process.env.CLICKHOUSE_HOST
  if (!host) {
    throw new Error(
      'CLICKHOUSE_HOST environment variable is not set. Add it to your .env file.'
    )
  }

  const password = process.env.CLICKHOUSE_PASSWORD
  if (!password) {
    throw new Error(
      'CLICKHOUSE_PASSWORD environment variable is not set. Add it to your .env file.'
    )
  }

  const port = parseInt(process.env.CLICKHOUSE_PORT || '8443', 10)
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(
      'CLICKHOUSE_PORT must be a valid port number (1-65535).'
    )
  }

  const database = process.env.CLICKHOUSE_DB || 'default'
  const user = process.env.CLICKHOUSE_USER || 'default'
  const secure = process.env.CLICKHOUSE_SECURE !== 'false'
  const timeoutSeconds = parseInt(process.env.CLICKHOUSE_TIMEOUT || '30', 10)
  const requestTimeout = timeoutSeconds * 1000
  const maxRetries = parseInt(process.env.CLICKHOUSE_MAX_RETRIES || '3', 10)

  return {
    host,
    port,
    database,
    user,
    password,
    secure,
    requestTimeout,
    maxRetries,
  }
}
