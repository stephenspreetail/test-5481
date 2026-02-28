/**
 * Vercel AI SDK tool definitions wrapping ClickHouse functions.
 * Uses AI SDK v6 API with `inputSchema` (not `parameters`).
 */
import { tool } from 'ai'
import { z } from 'zod'
import type { ChatMode } from '@/types'

export const runQueryTool = tool({
  description:
    'Execute a read-only SQL SELECT query against ClickHouse. Returns columns, rows, row count, and execution time.',
  inputSchema: z.object({
    query: z.string().describe('ClickHouse SQL SELECT query to execute'),
  }),
  execute: async ({ query }) => {
    const { runQuery } = await import('../clickhouse/tools')
    try {
      return await runQuery(query)
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Query failed',
        query,
        columns: [] as string[],
        rows: [] as Record<string, unknown>[],
        rowCount: 0,
        executionTimeMs: 0,
      }
    }
  },
})

export const listDatabasesTool = tool({
  description:
    'List all available databases on the ClickHouse server.',
  inputSchema: z.object({}),
  execute: async () => {
    const { listDatabases } = await import('../clickhouse/tools')
    try {
      return await listDatabases()
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to list databases',
        databases: [] as string[],
      }
    }
  },
})

export const listTablesTool = tool({
  description:
    'List tables in a ClickHouse database with optional LIKE filter. Returns table name, engine, and row count.',
  inputSchema: z.object({
    database: z.string().describe('Database name to list tables from'),
    like: z
      .string()
      .optional()
      .describe('Optional LIKE pattern to filter table names'),
  }),
  execute: async ({ database, like }) => {
    const { listTables } = await import('../clickhouse/tools')
    try {
      return await listTables(database, like)
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to list tables',
        tables: [] as { name: string; engine: string; total_rows: string }[],
      }
    }
  },
})

/**
 * All tools combined into a single object (used for discovery mode).
 */
const allTools = {
  run_query: runQueryTool,
  list_databases: listDatabasesTool,
  list_tables: listTablesTool,
}

/**
 * Metadata-only tools (schema is provided in prompt, no need for discovery).
 */
const metadataTools = {
  run_query: runQueryTool,
}

/**
 * Returns the appropriate set of tools based on chat mode.
 * - metadata mode: only run_query (schema is provided in prompt)
 * - discovery mode: all tools (agent explores schema first)
 */
export function getToolsForMode(mode: ChatMode) {
  return mode === 'metadata' ? metadataTools : allTools
}
