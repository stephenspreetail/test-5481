/**
 * ClickHouse Cloud client (singleton)
 * Creates and manages a single ClickHouse client instance.
 * This module runs ONLY on the server (Nitro runtime).
 */
import { createClient, type ClickHouseClient } from '@clickhouse/client'
import { getClickHouseConfig } from './config'

let client: ClickHouseClient | null = null
let initPromise: Promise<void> | null = null

/**
 * Returns a singleton ClickHouse client instance.
 * The client is lazily created on first call and reused for subsequent calls.
 *
 * On first creation, an async ping is initiated to wake ClickHouse Cloud
 * instances. Use `await ensureClient()` before first query to guarantee
 * the connection is verified.
 */
export function getClient(): ClickHouseClient {
  if (client) {
    return client
  }

  const config = getClickHouseConfig()
  const protocol = config.secure ? 'https' : 'http'

  client = createClient({
    url: `${protocol}://${config.host}:${config.port}`,
    username: config.user,
    password: config.password,
    database: config.database,
    request_timeout: config.requestTimeout,
    max_open_connections: 10,
  })

  // Kick off async ping (awaited via ensureClient)
  initPromise = pingClickHouse().then(() => {})

  return client
}

/**
 * Ensures the ClickHouse client is created and the startup ping has completed.
 * Call this before the first query to avoid racing the ping.
 */
export async function ensureClient(): Promise<ClickHouseClient> {
  const c = getClient()
  if (initPromise) {
    await initPromise
    initPromise = null
  }
  return c
}

/**
 * Pings the ClickHouse server to verify connectivity.
 * Called automatically when the singleton client is first created.
 * This is especially useful for ClickHouse Cloud instances that may be asleep.
 */
export async function pingClickHouse(): Promise<boolean> {
  if (!client) return false

  try {
    const result = await client.ping()
    if (result.success) {
      console.log('[ClickHouse] Connection verified')
    } else {
      console.warn('[ClickHouse] Ping failed:', result.error.message)
    }
    return result.success
  } catch (error) {
    console.warn(
      '[ClickHouse] Ping error:',
      error instanceof Error ? error.message : error
    )
    return false
  }
}

/**
 * Closes the ClickHouse client connection.
 * Called automatically on SIGTERM/SIGINT for graceful shutdown.
 */
export async function closeClient(): Promise<void> {
  if (client) {
    await client.close()
    client = null
    initPromise = null
  }
}

// Register shutdown hooks to close the connection on process exit
function registerShutdownHooks() {
  const shutdown = async () => {
    console.log('[ClickHouse] Shutting down connection...')
    await closeClient()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

registerShutdownHooks()
