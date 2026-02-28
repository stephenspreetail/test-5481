# ISS Technical Design: Chat-to-Insight Pipeline

## Overview

ISS uses a three-agent orchestration pipeline to turn natural-language questions into ClickHouse SQL queries and streamed analytical responses. This document traces the full lifecycle of a user message from chat submission through LLM processing and back to the rendered UI.

---

## System Architecture

```
+------------------+      +-------------------+      +-------------------------+
|                  |      |                   |      |                         |
|  Chat Sidebar    |      |   Chat Panel      |      |   Artifact Panel        |
|  (localStorage)  |      |   (useChat hook)  |      |   (Table/Chart/SQL)     |
|                  |      |                   |      |                         |
+------------------+      +--------+----------+      +------------+------------+
                                   |                              ^
                          POST /api/chat                          |
                          {messages, mode}              artifact JSON extracted
                                   |                     from streamed markdown
                                   v                              |
                          +--------+----------+                   |
                          |  Nitro Server     |                   |
                          |  (api/chat.ts)    |                   |
                          +--------+----------+                   |
                                   |                              |
                          runAgentPipeline()                      |
                                   |                              |
                 +-----------------+-----------------+            |
                 |                 |                 |            |
                 v                 v                 v            |
          +------+------+  +------+------+  +-------+------+    |
          | Agent 1     |  | Agent 2     |  | Agent 3      |    |
          | Question    |  | ClickHouse  |  | Analysis     +----+
          | Analyzer    |  | Agent       |  | (streaming)  |
          | (generateText) | (generateText  | (streamText) |
          +-------------+  |  + tools)   |  +--------------+
                            +------+------+
                                   |
                            tool calls:
                            run_query
                            list_databases*
                            list_tables*
                                   |
                                   v
                          +--------+----------+
                          | ClickHouse Cloud  |
                          | (HTTPS/TLS)       |
                          +-------------------+

                          * discovery mode only
```

---

## Detailed Flow

### Phase 1: User Submits a Message

**Entry point:** `src/routes/index.tsx` — `handleSubmit()`

1. User types in `ChatInput` and presses Enter (or clicks send).
2. `handleSubmit()` validates input is non-empty and no request is in-flight.
3. If no active conversation exists, one is created via `useConversations.createConversation()` and persisted to localStorage (`iss-conversations` key).
4. Agent step indicators are set to their initial state:
   ```
   analyzer: running | clickhouse: pending | analysis: pending
   ```
5. `sendMessage({ text: trimmed })` is called on the AI SDK `useChat` hook.

**Key file references:**
- `src/routes/index.tsx:116-132` — handleSubmit
- `src/components/chat/chat-input.tsx:35-42` — Enter key handler
- `src/hooks/use-conversations.ts:23-40` — createConversation

### Phase 2: Client-to-Server Transport

**AI SDK `useChat` hook** (`@ai-sdk/react`)

The hook is initialized with a `DefaultChatTransport` configured to POST to `/api/chat`:

```ts
const transport = useMemo(
  () => new DefaultChatTransport({ api: '/api/chat', body: { mode } }),
  [mode]
)
```

When `sendMessage()` is called, the transport:
1. Serializes the full `UIMessage[]` array plus the current `mode` ("metadata" or "discovery") into the request body.
2. Sends `POST /api/chat` with `Content-Type: application/json`.
3. Opens a streaming connection to consume the response as a UI message stream.
4. The hook sets `status` to `"submitted"`, then `"streaming"` once chunks arrive.

**Key file references:**
- `src/routes/index.tsx:40-59` — transport & useChat setup

### Phase 3: Server Receives Request

**Entry point:** `src/routes/api/chat.ts` — POST handler

The TanStack Start file-based route registers a server-side POST handler:

```ts
export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => { ... }
    }
  }
})
```

1. Parses request body: `{ messages: UIMessage[], mode: ChatMode }`.
2. Defaults mode to `"metadata"` if omitted.
3. Calls `runAgentPipeline({ messages, mode })`.
4. Returns the streaming `Response` directly, or a JSON error on failure.

**Key file references:**
- `src/routes/api/chat.ts:13-39` — route handler

### Phase 4: Agent Orchestration

**Entry point:** `src/lib/ai/orchestrator.ts` — `runAgentPipeline()`

The orchestrator extracts the user's question, builds conversation context from prior messages, optionally loads schema metadata, then runs three agents inside a `createUIMessageStream`:

```
messages[] --> extract latest user text --> question
messages[] --> all prior messages      --> conversationContext
mode       --> if "metadata"           --> loadMetadata() from .clickhouse/metadata.yml
```

The three agents execute sequentially within the stream's `execute` callback. Agents 1 and 2 run to completion (non-streaming). Agent 3 streams its output, which is merged into the response stream via `writer.merge()`.

**Key file references:**
- `src/lib/ai/orchestrator.ts:18-121` — full pipeline

---

### Phase 4a: Agent 1 — Question Analyzer

**File:** `src/lib/ai/agents/question-analyzer.ts`

| Property       | Value                                  |
|----------------|----------------------------------------|
| AI SDK method  | `generateText` (non-streaming)         |
| Model          | `claude-sonnet-4-20250514`             |
| Input          | User question + conversation context   |
| Output         | `AnalysisPlan` JSON                    |

**What it does:**
1. Constructs a prompt combining the question with prior conversation context (if any).
2. Calls Claude with a system prompt describing the full database schema at a summary level (table names, key columns, data encoding notes).
3. Claude returns a JSON object which is parsed into an `AnalysisPlan`:

```ts
interface AnalysisPlan {
  intent: string              // "Find top sellers by revenue"
  relevant_tables: string[]   // ["Sellers", "Products"]
  suggested_approach: string  // "JOIN Sellers with Products, aggregate..."
  business_context: string    // "Understanding top sellers helps..."
}
```

4. If the response is wrapped in markdown code fences, they are stripped before parsing.

**Error handling:** Throws if JSON parsing fails, which propagates to the stream's `onError`.

**Key file references:**
- `src/lib/ai/agents/question-analyzer.ts:11-42`
- `src/lib/ai/system-prompts.ts:6-39` — getQuestionAnalyzerPrompt

---

### Phase 4b: Agent 2 — ClickHouse Agent

**File:** `src/lib/ai/agents/clickhouse-agent.ts`

| Property       | Value                                         |
|----------------|-----------------------------------------------|
| AI SDK method  | `generateText` with tools (non-streaming)     |
| Model          | `claude-sonnet-4-20250514`                    |
| Input          | `AnalysisPlan` + system prompt with schema    |
| Output         | `DataQueryResult { results, sqlQueries }`     |
| Max steps      | 5 (via `stopWhen: stepCountIs(5)`)            |

**What it does:**
1. Selects the tool set based on chat mode:
   - **Metadata mode:** `{ run_query }` only — schema already in prompt
   - **Discovery mode:** `{ run_query, list_databases, list_tables }` — agent explores first
2. Calls Claude with the analysis plan and query guidelines (FINAL keyword, _deleted filter, price/rating encoding, LIMIT enforcement).
3. Claude issues tool calls which the AI SDK executes automatically:

**Tool definitions** (`src/lib/ai/tools.ts`):

| Tool             | Input                      | Calls                             | Output                          |
|------------------|----------------------------|-----------------------------------|---------------------------------|
| `run_query`      | `{ query: string }`        | `clickhouse/tools.runQuery()`     | `QueryResult` or error object   |
| `list_databases` | `{}`                       | `clickhouse/tools.listDatabases()`| `{ databases: string[] }`       |
| `list_tables`    | `{ database, like? }`      | `clickhouse/tools.listTables()`   | `{ tables: [...] }`            |

4. After all steps complete, the orchestrator iterates through `result.steps` and collects:
   - All `QueryResult` objects from successful `run_query` calls → `results[]`
   - All SQL strings → `sqlQueries[]`

**ClickHouse safety layer** (`src/lib/clickhouse/tools.ts`):
- Write operations (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`) are rejected with an error.
- Trailing semicolons are stripped.
- If no `LIMIT` clause is present, `LIMIT 1000` is appended.
- Queries are executed with a 30-second `AbortSignal` timeout.
- Results are returned as `JSONEachRow` format.

**ClickHouse client** (`src/lib/clickhouse/client.ts`):
- Singleton pattern with lazy initialization.
- On first creation, an async ping wakes ClickHouse Cloud instances.
- `ensureClient()` awaits the ping before allowing queries.
- Max 10 open connections. Graceful shutdown on SIGTERM/SIGINT.

**Key file references:**
- `src/lib/ai/agents/clickhouse-agent.ts:13-59`
- `src/lib/ai/tools.ts:9-95` — tool definitions
- `src/lib/clickhouse/tools.ts:18-66` — runQuery safety + execution
- `src/lib/clickhouse/client.ts:20-54` — singleton client

---

### Phase 4c: Agent 3 — Analysis Agent

**File:** `src/lib/ai/agents/analysis-agent.ts`

| Property       | Value                                          |
|----------------|------------------------------------------------|
| AI SDK method  | `streamText` (streaming)                       |
| Model          | `claude-sonnet-4-20250514`                     |
| Input          | Question + AnalysisPlan + QueryResult[]        |
| Output         | Streaming markdown with embedded artifact JSON |

**What it does:**
1. Constructs a prompt containing the original question, analysis plan, and all query results.
2. Calls Claude with a system prompt instructing it to produce:
   - **Summary** — direct answer to the question
   - **Key Findings** — formatted data points (dollars, star ratings)
   - **Business Insights** — strategic interpretation
   - **Artifact Block** — a specially formatted code block for visualization
   - **Follow-up Questions** — suggested next queries
3. The response streams token-by-token back through the orchestrator.

**Artifact block format** (emitted by the LLM inside the markdown stream):

````
```artifact
{"type":"query-result","title":"Top 10 Sellers","result":{...QueryResult},"vizHint":"bar-chart"}
```
````

4. The orchestrator merges this stream into the UI message stream:
   ```ts
   writer.merge(analysisResult.toUIMessageStream())
   ```

**Key file references:**
- `src/lib/ai/agents/analysis-agent.ts:12-29`
- `src/lib/ai/system-prompts.ts:75-103` — getAnalysisAgentPrompt

---

### Phase 5: Response Streams Back to Client

The AI SDK `useChat` hook consumes the streaming response:

1. `status` transitions from `"submitted"` to `"streaming"`.
2. As text chunks arrive, the `messages` array is updated reactively — the last message gains content progressively.
3. `ChatMessages` renders each message via `MessageBubble`, with auto-scroll to the bottom on updates.
4. The `AgentStepIndicator` shows a running/pending/completed spinner for each agent phase while `isLoading` is true.

**Key file references:**
- `src/routes/index.tsx:46-59` — useChat with onFinish/onError
- `src/components/chat/chat-messages.tsx:23-58` — message rendering
- `src/components/chat/agent-step-indicator.tsx:27-51` — step UI

---

### Phase 6: Artifact Extraction and Visualization

**Trigger:** `useChat.onFinish` callback fires when the stream completes.

1. `extractArtifact()` runs a regex against the completed assistant message:
   ```ts
   const match = text.match(/```artifact\n([\s\S]*?)\n```/)
   ```
2. If a match is found, the JSON is parsed into an `ArtifactData` object:
   ```ts
   interface ArtifactData {
     type: 'query-result'
     title: string
     result: QueryResult
     vizHint?: 'table' | 'bar-chart' | 'line-chart' | 'metric-card'
   }
   ```
3. `openArtifact(artifact)` sets the artifact panel to open and defaults to the "table" tab.
4. The `AppLayout` conditionally renders the third resizable panel.

**Visualization routing** (`src/components/viz/data-visualization.tsx`):

The `vizHint` from the LLM is used directly. If absent, `suggestVisualization()` auto-detects:

| Condition                                          | Visualization  |
|----------------------------------------------------|----------------|
| 1 row, <=3 columns                                 | `metric-card`  |
| Has date-like column + numeric column + >2 rows    | `line-chart`   |
| Has string column + numeric column + <=20 rows     | `bar-chart`    |
| Default                                            | `table`        |

The artifact panel renders three tabs:
- **Table** — `DataTable` with column headers and rows
- **Chart** — `BarChartViz`, `LineChartViz`, or `MetricCard` (Recharts)
- **SQL** — `SqlDisplay` showing the executed query

**Key file references:**
- `src/routes/index.tsx:63-83` — extractArtifact
- `src/hooks/use-artifact.ts:6-30` — artifact state
- `src/components/artifact/artifact-tabs.tsx:14-47` — tab rendering
- `src/components/viz/data-visualization.tsx:13-47` — viz routing
- `src/lib/viz/data-analyzer.ts:28-47` — auto-suggestion algorithm

---

### Phase 7: Conversation Persistence

After the message array updates, an effect saves to localStorage:

```ts
useEffect(() => {
  if (messages.length > 0 && activeConversationId) {
    saveCurrentConversation(messages)
  }
}, [messages.length])
```

- The conversation title is extracted from the first user message (truncated to 50 characters).
- `updatedAt` is refreshed on every save.
- All data is stored under the `iss-conversations` localStorage key as a JSON array.
- The sidebar re-renders via `refresh()` which calls `listConversations()` (sorted by `updatedAt` descending).

**Key file references:**
- `src/routes/index.tsx:135-139` — save effect
- `src/hooks/use-conversations.ts:50-70` — saveCurrentConversation
- `src/lib/store/conversations.ts:9-65` — localStorage CRUD

---

## Sequence Diagram

```
User        ChatInput     useChat/Transport    Nitro Server     Agent 1        Agent 2        Agent 3        ClickHouse
 |              |               |                   |               |              |              |              |
 |--type+Enter->|               |                   |               |              |              |              |
 |              |--sendMessage->|                    |               |              |              |              |
 |              |               |--POST /api/chat--->|               |              |              |              |
 |              |               |  {messages, mode}  |               |              |              |              |
 |              |               |                    |--analyzeQ---->|              |              |              |
 |              |               |                    |  (generateText)|              |              |              |
 |              |               |                    |<-AnalysisPlan-|              |              |              |
 |              |               |                    |                              |              |              |
 |              |               |                    |--executeQueries------------->|              |              |
 |              |               |                    |               (generateText + tools)        |              |
 |              |               |                    |               |              |--run_query-->|              |
 |              |               |                    |               |              |<--results----|              |
 |              |               |                    |               |              | (may repeat) |              |
 |              |               |                    |<--DataQueryResult------------|              |              |
 |              |               |                    |                                             |              |
 |              |               |                    |--streamAnalysis---------------------------->|              |
 |              |               |                    |               (streamText)                  |              |
 |              |               |<===streaming tokens (merged into UIMessageStream)===============|              |
 |              |               |                    |                                             |              |
 |<--messages[] updated---------|                    |                                             |              |
 |  (progressive rendering)     |                    |                                             |              |
 |              |               |                    |                                             |              |
 |              |               |<==stream complete==|                                             |              |
 |              |               |                    |                                             |              |
 |--onFinish: extractArtifact-->|                    |                                             |              |
 |--openArtifact (viz panel)--->|                    |                                             |              |
 |--saveConversation (localStorage)                  |                                             |              |
```

---

## Schema Context Loading

The metadata mode injects full column-level schema into Agent 2's system prompt, loaded from `.clickhouse/metadata.yml`:

```
loadMetadata() --> readFileSync('.clickhouse/metadata.yml')
              --> yaml.load()
              --> format as structured text (table/column/type/description)
              --> cache in module-level variable (loaded once per process)
```

This gives Agent 2 enough context to write correct SQL without needing discovery tool calls, reducing latency by 1-2 LLM round-trips compared to discovery mode.

---

## Error Handling

| Layer                     | Strategy                                                         |
|---------------------------|------------------------------------------------------------------|
| ChatInput                 | Disabled send when empty or loading                              |
| useChat hook              | `onError` clears agent steps; status resets                      |
| API route                 | try/catch returns `{ error }` JSON with 500 status               |
| Orchestrator stream       | `onError` callback logs and returns error message string          |
| Agent 1 (JSON parse)      | Throws with descriptive message including raw text preview        |
| Agent 2 (tool execution)  | Each tool wraps errors into `{ error, query, ... }` objects      |
| ClickHouse tools          | Write rejection, LIMIT enforcement, 30s timeout                  |
| ClickHouse client         | Startup ping, graceful SIGTERM/SIGINT shutdown                   |
| Artifact extraction       | Silent catch — missing/malformed artifacts are simply not shown  |

---

## Mode Comparison

|                          | Metadata Mode                           | Discovery Mode                            |
|--------------------------|-----------------------------------------|-------------------------------------------|
| Schema source            | `.clickhouse/metadata.yml` in prompt    | Dynamic via `list_databases`/`list_tables` |
| Agent 2 tools            | `run_query` only                        | `run_query` + `list_databases` + `list_tables` |
| Latency                  | Lower (fewer LLM round-trips)           | Higher (schema exploration steps)         |
| Flexibility              | Fixed to known schema                   | Can discover unknown tables               |
| Typical Agent 2 steps    | 1-2                                     | 3-5                                       |
