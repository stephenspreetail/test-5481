import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  isSql,
  groupLogsByAgent,
  computeAgentDuration,
  buildSummaryLabel,
} from '../pipeline-display'
import type { PipelineLogs, PipelineLogEntry } from '@/types'

describe('formatDuration', () => {
  it('formats milliseconds under 1000', () => {
    expect(formatDuration(350)).toBe('350ms')
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('formats seconds at or above 1000ms', () => {
    expect(formatDuration(1000)).toBe('1.0s')
    expect(formatDuration(1500)).toBe('1.5s')
    expect(formatDuration(2100)).toBe('2.1s')
    expect(formatDuration(12345)).toBe('12.3s')
  })
})

describe('isSql', () => {
  it('detects SELECT statements', () => {
    expect(isSql('SELECT * FROM table')).toBe(true)
    expect(isSql('  SELECT count(*) FROM users')).toBe(true)
  })

  it('detects WITH statements', () => {
    expect(isSql('WITH cte AS (SELECT 1) SELECT * FROM cte')).toBe(true)
  })

  it('detects SHOW statements', () => {
    expect(isSql('SHOW TABLES')).toBe(true)
  })

  it('detects FROM keyword', () => {
    expect(isSql('some query FROM table')).toBe(true)
  })

  it('returns false for non-SQL text', () => {
    expect(isSql('Hello world')).toBe(false)
    expect(isSql('Analysis complete')).toBe(false)
  })
})

describe('groupLogsByAgent', () => {
  it('returns empty object for undefined logs', () => {
    expect(groupLogsByAgent(undefined)).toEqual({})
  })

  it('groups entries by agent, skipping orchestrator', () => {
    const logs: PipelineLogs = {
      entries: [
        { timestamp: 1, agent: 'orchestrator', level: 'info', message: 'Start' },
        { timestamp: 2, agent: 'analyzer', level: 'info', message: 'Analyzing' },
        { timestamp: 3, agent: 'analyzer', level: 'success', message: 'Done', durationMs: 100 },
        { timestamp: 4, agent: 'clickhouse', level: 'info', message: 'Query 1', durationMs: 200 },
        { timestamp: 5, agent: 'clickhouse', level: 'success', message: 'Query 2', durationMs: 300 },
      ],
      totalDurationMs: 600,
      queryCount: 2,
      hasErrors: false,
    }

    const grouped = groupLogsByAgent(logs)
    expect(Object.keys(grouped)).toEqual(['analyzer', 'clickhouse'])
    expect(grouped['orchestrator']).toBeUndefined()
    expect(grouped['analyzer']).toHaveLength(2)
    expect(grouped['clickhouse']).toHaveLength(2)
  })
})

describe('computeAgentDuration', () => {
  it('returns null for undefined entries', () => {
    expect(computeAgentDuration(undefined)).toBeNull()
  })

  it('returns null for empty entries', () => {
    expect(computeAgentDuration([])).toBeNull()
  })

  it('sums durationMs values', () => {
    const entries: PipelineLogEntry[] = [
      { timestamp: 1, agent: 'clickhouse', level: 'info', message: 'Q1', durationMs: 200 },
      { timestamp: 2, agent: 'clickhouse', level: 'success', message: 'Q2', durationMs: 300 },
    ]
    expect(computeAgentDuration(entries)).toBe(500)
  })

  it('returns null if all durations are zero or missing', () => {
    const entries: PipelineLogEntry[] = [
      { timestamp: 1, agent: 'analyzer', level: 'info', message: 'Start' },
    ]
    expect(computeAgentDuration(entries)).toBeNull()
  })
})

describe('buildSummaryLabel', () => {
  const logs: PipelineLogs = {
    entries: [],
    totalDurationMs: 500,
    queryCount: 3,
    hasErrors: false,
  }

  it('returns query count + duration for clickhouse agent', () => {
    expect(buildSummaryLabel('clickhouse', 2100, logs)).toBe('3 queries, 2.1s')
  })

  it('handles singular query count', () => {
    const singleQueryLogs = { ...logs, queryCount: 1 }
    expect(buildSummaryLabel('clickhouse', 500, singleQueryLogs)).toBe('1 query, 500ms')
  })

  it('returns just duration for non-clickhouse agents', () => {
    expect(buildSummaryLabel('analyzer', 1200, logs)).toBe('1.2s')
  })

  it('returns undefined when no duration', () => {
    expect(buildSummaryLabel('analyzer', null)).toBeUndefined()
  })
})
