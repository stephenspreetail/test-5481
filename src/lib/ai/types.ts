/**
 * AI-specific types used across the multi-agent pipeline.
 */
import type { QueryResult } from '@/types'

export interface AnalysisPlan {
  intent: string
  relevant_tables: string[]
  suggested_approach: string
  business_context: string
}

export interface DataQueryResult {
  results: QueryResult[]
  sqlQueries: string[]
}
