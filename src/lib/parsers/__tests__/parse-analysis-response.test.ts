import { describe, it, expect } from 'vitest'
import { parseAnalysisResponse, ARTIFACT_BLOCK_REGEX } from '../parse-analysis-response'

const FULL_RESPONSE = `## Summary

The top 10 sellers by Buy Box win rate show strong performance across the marketplace.

## Key Findings

- Seller A has a 98% Buy Box win rate with $12.50 average price
- Seller B follows at 95% with 4.5 star rating
- Most top sellers use FBA fulfillment

## Business Insights

These results suggest that FBA usage and competitive pricing are key factors in winning the Buy Box. Sellers should focus on maintaining high ratings.

\`\`\`artifact
{"type":"query-result","title":"Top Sellers","result":{"columns":["name"],"rows":[],"rowCount":0,"query":"SELECT 1","executionTimeMs":100},"vizHint":"table"}
\`\`\`

## Follow-up Questions

1. What is the average price point for top Buy Box winners?
2. How does seller rating correlate with Buy Box win rate?
3. Which categories have the highest Buy Box competition?`

describe('parseAnalysisResponse', () => {
  it('parses a complete response with all sections', () => {
    const result = parseAnalysisResponse(FULL_RESPONSE)

    expect(result.summary).toContain('top 10 sellers')
    expect(result.keyFindings).toContain('98% Buy Box win rate')
    expect(result.businessInsights).toContain('FBA usage and competitive pricing')
    expect(result.followUpQuestions).toHaveLength(3)
    expect(result.followUpQuestions[0]).toContain('average price point')
    expect(result.artifactJson).toContain('"type":"query-result"')
    expect(result.cleanMarkdown).not.toContain('```artifact')
  })

  it('returns nulls for empty input', () => {
    const result = parseAnalysisResponse('')

    expect(result.summary).toBeNull()
    expect(result.keyFindings).toBeNull()
    expect(result.businessInsights).toBeNull()
    expect(result.followUpQuestions).toEqual([])
    expect(result.artifactJson).toBeNull()
    expect(result.cleanMarkdown).toBe('')
  })

  it('handles partial streaming (only summary so far)', () => {
    const partial = `## Summary

The analysis is underway with initial results showing strong performance.`

    const result = parseAnalysisResponse(partial)

    expect(result.summary).toContain('analysis is underway')
    expect(result.keyFindings).toBeNull()
    expect(result.businessInsights).toBeNull()
    expect(result.followUpQuestions).toEqual([])
    expect(result.artifactJson).toBeNull()
  })

  it('handles bold-style headings', () => {
    const boldFormat = `**Summary**
Top sellers are performing well.

**Key Findings**
- Seller A leads with 98% win rate
- Seller B at 95%

**Business Insights**
FBA is critical for success.

**Follow-up Questions**
1. What about pricing?
2. How do ratings matter?`

    const result = parseAnalysisResponse(boldFormat)

    expect(result.summary).toContain('performing well')
    expect(result.keyFindings).toContain('98% win rate')
    expect(result.businessInsights).toContain('FBA is critical')
    expect(result.followUpQuestions).toHaveLength(2)
  })

  it('handles missing follow-up questions section', () => {
    const noFollowUp = `## Summary

Results are in.

## Key Findings

- Data point 1
- Data point 2

## Business Insights

Important context here.`

    const result = parseAnalysisResponse(noFollowUp)

    expect(result.summary).not.toBeNull()
    expect(result.keyFindings).not.toBeNull()
    expect(result.businessInsights).not.toBeNull()
    expect(result.followUpQuestions).toEqual([])
  })

  it('extracts artifact block from middle of content', () => {
    const withArtifact = `## Summary

Here are the results.

\`\`\`artifact
{"type":"query-result","title":"Test","result":{"columns":[],"rows":[],"rowCount":0,"query":"SELECT 1","executionTimeMs":50},"vizHint":"bar-chart"}
\`\`\`

## Key Findings

- Finding 1`

    const result = parseAnalysisResponse(withArtifact)

    expect(result.artifactJson).toContain('"vizHint":"bar-chart"')
    expect(result.cleanMarkdown).not.toContain('```artifact')
    expect(result.summary).toContain('results')
    expect(result.keyFindings).toContain('Finding 1')
  })

  it('handles bulleted follow-up questions with dashes', () => {
    const dashList = `## Follow-up Questions

- What about seller feedback trends?
- How do prices compare across categories?`

    const result = parseAnalysisResponse(dashList)

    expect(result.followUpQuestions).toHaveLength(2)
    expect(result.followUpQuestions[0]).toBe('What about seller feedback trends?')
  })

  it('strips clean markdown of artifact block', () => {
    const text = `Some text before

\`\`\`artifact
{"data": true}
\`\`\`

Some text after`

    const result = parseAnalysisResponse(text)

    expect(result.cleanMarkdown).toContain('Some text before')
    expect(result.cleanMarkdown).toContain('Some text after')
    expect(result.cleanMarkdown).not.toContain('artifact')
  })

  it('ARTIFACT_BLOCK_REGEX matches correctly', () => {
    const text = 'before\n```artifact\n{"key":"value"}\n```\nafter'
    const match = text.match(ARTIFACT_BLOCK_REGEX)
    expect(match).not.toBeNull()
    expect(match![1]).toBe('{"key":"value"}')
  })

  it('returns full cleanMarkdown when no sections match', () => {
    const unstructured = 'Just a plain response with no headings.'
    const result = parseAnalysisResponse(unstructured)

    expect(result.summary).toBeNull()
    expect(result.keyFindings).toBeNull()
    expect(result.cleanMarkdown).toBe('Just a plain response with no headings.')
  })
})
