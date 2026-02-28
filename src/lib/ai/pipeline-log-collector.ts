import type { PipelineLogEntry, PipelineLogAgent, PipelineLogLevel, PipelineLogs } from '@/types'

export class PipelineLogCollector {
  private entries: PipelineLogEntry[] = []
  private startTime = Date.now()
  private queryCount = 0
  private hasErrors = false

  log(
    agent: PipelineLogAgent,
    level: PipelineLogLevel,
    message: string,
    extra?: Partial<Pick<PipelineLogEntry, 'detail' | 'durationMs' | 'rowCount'>>
  ): void {
    this.entries.push({
      timestamp: Date.now(),
      agent,
      level,
      message,
      ...extra,
    })
    if (level === 'error') this.hasErrors = true
    // Keep console.log for server-side debugging
    const prefix = `[${agent}]`
    if (level === 'error') {
      console.error(prefix, message, extra?.detail ?? '')
    } else {
      console.log(prefix, message, extra?.detail ? `| ${extra.detail}` : '')
    }
  }

  addQueryCount(n: number): void {
    this.queryCount += n
  }

  toJSON(): PipelineLogs {
    return {
      entries: this.entries,
      totalDurationMs: Date.now() - this.startTime,
      queryCount: this.queryCount,
      hasErrors: this.hasErrors,
    }
  }
}
