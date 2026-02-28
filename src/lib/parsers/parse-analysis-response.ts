export const ARTIFACT_BLOCK_REGEX = /```artifact\n([\s\S]*?)\n```/

export interface ParsedAnalysis {
  summary: string | null
  keyFindings: string | null
  businessInsights: string | null
  followUpQuestions: string[]
  artifactJson: string | null
  cleanMarkdown: string
}

/**
 * Section heading patterns we look for (both ## and **bold** variants)
 * Captures content between matched headings.
 */
const SECTION_PATTERNS: Record<string, RegExp> = {
  summary: /(?:^|\n)(?:##\s*\**Summary\**|(?:\*\*Summary[:\s]*\*\*))\s*\n([\s\S]*?)(?=\n(?:##\s|\*\*(?:Key Findings|Business Insights|Follow[- ]?up Questions|Artifact))|$)/i,
  keyFindings: /(?:^|\n)(?:##\s*\**Key Findings\**|(?:\*\*Key Findings[:\s]*\*\*))\s*\n([\s\S]*?)(?=\n(?:##\s|\*\*(?:Summary|Business Insights|Follow[- ]?up Questions|Artifact))|$)/i,
  businessInsights: /(?:^|\n)(?:##\s*\**Business Insights?\**|(?:\*\*Business Insights?[:\s]*\*\*))\s*\n([\s\S]*?)(?=\n(?:##\s|\*\*(?:Summary|Key Findings|Follow[- ]?up Questions|Artifact))|$)/i,
  followUpQuestions: /(?:^|\n)(?:##\s*\**Follow[- ]?up Questions?\**|(?:\*\*Follow[- ]?up Questions?[:\s]*\*\*))\s*\n([\s\S]*?)(?=\n(?:##\s|\*\*(?:Summary|Key Findings|Business Insights|Artifact))|$)/i,
}

function extractFollowUpQuestions(text: string): string[] {
  const lines = text.split('\n')
  const questions: string[] = []
  for (const line of lines) {
    // Match numbered (1. / 1) ) or bulleted (- / * ) list items
    const match = line.match(/^\s*(?:\d+[.)]\s*|-\s*|\*\s*)(.+)/)
    if (match) {
      const q = match[1].trim().replace(/\*\*/g, '')
      if (q.length > 0) {
        questions.push(q)
      }
    }
  }
  return questions
}

export function parseAnalysisResponse(markdown: string): ParsedAnalysis {
  if (!markdown || markdown.trim().length === 0) {
    return {
      summary: null,
      keyFindings: null,
      businessInsights: null,
      followUpQuestions: [],
      artifactJson: null,
      cleanMarkdown: '',
    }
  }

  // Extract artifact block
  const artifactMatch = markdown.match(ARTIFACT_BLOCK_REGEX)
  const artifactJson = artifactMatch ? artifactMatch[1] : null
  const cleanMarkdown = markdown.replace(ARTIFACT_BLOCK_REGEX, '').trim()

  // Extract sections
  const summaryMatch = cleanMarkdown.match(SECTION_PATTERNS.summary)
  const keyFindingsMatch = cleanMarkdown.match(SECTION_PATTERNS.keyFindings)
  const businessInsightsMatch = cleanMarkdown.match(SECTION_PATTERNS.businessInsights)
  const followUpMatch = cleanMarkdown.match(SECTION_PATTERNS.followUpQuestions)

  const summary = summaryMatch ? summaryMatch[1].trim() : null
  const keyFindings = keyFindingsMatch ? keyFindingsMatch[1].trim() : null
  const businessInsights = businessInsightsMatch ? businessInsightsMatch[1].trim() : null
  const followUpQuestions = followUpMatch
    ? extractFollowUpQuestions(followUpMatch[1])
    : []

  return {
    summary,
    keyFindings,
    businessInsights,
    followUpQuestions,
    artifactJson,
    cleanMarkdown,
  }
}
