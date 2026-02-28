/**
 * Metadata loader for ClickHouse table definitions.
 * Parses .clickhouse/metadata.yml and converts it to a structured
 * text string suitable for LLM system prompts.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import yaml from 'js-yaml'

interface ColumnDef {
  type: string
  description: string
  primary_key?: boolean
  sorting_key?: boolean
}

interface TableDef {
  description: string
  engine: string
  primary_key: string[]
  sorting_key?: string[]
  columns: Record<string, ColumnDef>
}

interface MetadataYaml {
  database: string
  service: string
  service_id: string
  source: string
  last_updated: string
  tables: Record<string, TableDef>
}

let cachedMetadata: string | null = null

/**
 * Load and parse the metadata YAML file, returning a formatted string
 * describing all tables for use in system prompts.
 * The result is cached after the first call.
 */
export function loadMetadata(): string {
  if (cachedMetadata) {
    return cachedMetadata
  }

  const metadataPath = resolve(process.cwd(), '.clickhouse', 'metadata.yml')
  const raw = readFileSync(metadataPath, 'utf-8')
  const metadata = yaml.load(raw) as MetadataYaml

  const lines: string[] = []
  lines.push(`Database: ${metadata.database}`)
  lines.push(`Service: ${metadata.service}`)
  lines.push(`Source: ${metadata.source}`)
  lines.push(`Last Updated: ${metadata.last_updated}`)
  lines.push('')

  for (const [tableName, table] of Object.entries(metadata.tables)) {
    lines.push(`## Table: ${tableName}`)
    lines.push(`Description: ${table.description.trim()}`)
    lines.push(`Engine: ${table.engine}`)
    lines.push(`Primary Key: (${table.primary_key.join(', ')})`)
    if (table.sorting_key) {
      lines.push(`Sorting Key: (${table.sorting_key.join(', ')})`)
    }
    lines.push('')
    lines.push('Columns:')

    for (const [colName, col] of Object.entries(table.columns)) {
      const markers: string[] = []
      if (col.primary_key) markers.push('PK')
      if (col.sorting_key) markers.push('SK')
      const suffix = markers.length > 0 ? ` [${markers.join(', ')}]` : ''
      lines.push(`  - ${colName} (${col.type})${suffix}: ${col.description}`)
    }

    lines.push('')
  }

  cachedMetadata = lines.join('\n')
  return cachedMetadata
}
