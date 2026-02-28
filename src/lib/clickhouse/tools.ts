/**
 * ClickHouse tool functions for AI agents.
 * These are called by the LLM tool-use layer to query ClickHouse.
 * This module runs ONLY on the server (Nitro runtime).
 */
import type { QueryResult } from '@/types'
import { ensureClient } from './client'

const WRITE_PATTERN = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i
const LIMIT_PATTERN = /\bLIMIT\s+\d+/i
const DEFAULT_LIMIT = 1000
const QUERY_TIMEOUT_MS = 30_000

/**
 * Execute a read-only SQL query against ClickHouse.
 * Safety: rejects write statements, adds LIMIT 1000 if missing, strips trailing semicolons.
 */
export async function runQuery(query: string): Promise<QueryResult> {
  console.log('[clickhouse/tools] runQuery called with:', query.substring(0, 300))

  // Strip trailing semicolons
  let sql = query.replace(/;\s*$/, '').trim()

  // Reject write operations
  if (WRITE_PATTERN.test(sql)) {
    console.error('[clickhouse/tools] Write operation rejected:', sql.substring(0, 100))
    throw new Error(
      'Write operations are not allowed. Only SELECT and read-only queries are permitted.'
    )
  }

  // Add default LIMIT if not present
  if (!LIMIT_PATTERN.test(sql)) {
    sql = `${sql} LIMIT ${DEFAULT_LIMIT}`
    console.log('[clickhouse/tools] Added default LIMIT, sql:', sql.substring(0, 300))
  }

  try {
    const client = await ensureClient()
    console.log('[clickhouse/tools] Client ready, executing query...')
    const start = performance.now()

    const result = await client.query({
      query: sql,
      format: 'JSONEachRow',
      abort_signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    })

    const rows = await result.json<Record<string, unknown>>()
    const executionTimeMs = Math.round(performance.now() - start)
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []

    console.log('[clickhouse/tools] Query success: %d columns, %d rows, %dms', columns.length, rows.length, executionTimeMs)

    return {
      columns,
      rows,
      rowCount: rows.length,
      query: sql,
      executionTimeMs,
    }
  } catch (err) {
    console.error('[clickhouse/tools] Query failed:', err)
    throw err
  }
}

/**
 * List all databases on the ClickHouse server.
 */
export async function listDatabases(): Promise<{ databases: string[] }> {
  const client = await ensureClient()

  const result = await client.query({
    query: 'SHOW DATABASES',
    format: 'JSONEachRow',
  })

  const rows = await result.json<{ name: string }>()
  return { databases: rows.map((r) => r.name) }
}

/**
 * List tables in a database with optional LIKE filter.
 * Uses parameterized queries for safety.
 */
export async function listTables(
  database: string,
  like?: string
): Promise<{
  tables: { name: string; engine: string; total_rows: string }[]
}> {
  const client = await ensureClient()

  let query: string
  let queryParams: Record<string, unknown> | undefined

  if (like) {
    query = `
      SELECT name, engine, toString(total_rows) as total_rows
      FROM system.tables
      WHERE database = {database:String}
        AND name LIKE {like:String}
      ORDER BY name
    `
    queryParams = { database, like }
  } else {
    query = `
      SELECT name, engine, toString(total_rows) as total_rows
      FROM system.tables
      WHERE database = {database:String}
      ORDER BY name
    `
    queryParams = { database }
  }

  const result = await client.query({
    query,
    format: 'JSONEachRow',
    query_params: queryParams,
  })

  const tables = await result.json<{
    name: string
    engine: string
    total_rows: string
  }>()

  return { tables }
}
