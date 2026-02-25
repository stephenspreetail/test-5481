---
planStatus:
  planId: plan-chat-feedback-display-upgrade
  title: Chat Feedback Display Upgrade
  status: draft
  planType: improvement
  priority: high
  owner: stephen.howard
  stakeholders: []
  tags:
    - ux
    - chat
    - agent
    - streaming
  created: "2026-02-21"
  updated: "2026-02-21T14:55:00.000Z"
  progress: 0
---
# Chat Feedback Display Upgrade

## Problem Statement

The current chat display renders agent responses as flat markdown with `[Using tool: ToolName]` markers inline. This creates a cluttered, hard-to-read experience where tool calls, file edits, text content, and status updates all bleed into each other. Modern AI chat experiences (Claude, ChatGPT, Lovable) use collapsible blocks and semantic grouping to keep the conversation clean while still exposing detail on demand.

### Current Architecture (What Exists Today)

**Data flow:**
1. **Claude Agent SDK** yields `SDKMessage` events (system, assistant with content blocks, user with tool_results, result, error)
2. **App-container** (`app-container/src/agent.ts`) transforms these to `AgentStreamEvent` types: `session_init`, `text`, `tool_use`, `tool_result`, `result`, `error`
3. **Backend** (`backend/src/websocket/handlers/chat-stream.handler.ts`) receives SSE and:
  - `text` events: appends text to `assistantContent` string, sends as `chat:response:delta`
  - `tool_use` events: appends `\n[Using tool: ${toolName}]\n` as plain text to `assistantContent`, sends as delta with `toolName`
  - `tool_result` events: ignored (comment says "handled internally by SDK")
  - Everything is stored as a single `content: string` in the `messages` DB table
4. **Frontend** (`src/components/chat/ChatMessage.tsx`): Passes the string to `KovaMarkdownParser` which renders it via `react-markdown` with each `<p>` rendered as a bordered block (`ResponseBlock`)

**Key insight:** The agent produces rich structured events (text blocks, tool calls with names and inputs, tool results), but the backend flattens everything into a single markdown string before sending to the frontend. The frontend has no semantic awareness of what's a tool call vs. text vs. a file edit.

### Available Agent Event Types (from `app-container/src/agent.ts`)

| Event Type | Data Available | Current Handling |
| --- | --- | --- |
| `session_init` | `sessionId` | Tracked internally, not displayed |
| `text` | `text` (markdown content) | Appended to content string, rendered as markdown |
| `tool_use` | `toolName`, `toolInput` | Flattened to `[Using tool: X]` text marker |
| `tool_result` | `content` (result data) | Completely ignored |
| `result` | `result`, `durationMs`, `costUsd`, `sessionId` | Only `costUsd`/`durationMs` tracked; `result` used as fallback content |
| `error` | `error` message | Sent as error event to frontend |

### SDK Content Block Types (from Claude Agent SDK via `parseSDKMessage`)

Within `assistant` messages, the SDK can produce content blocks:
- `text` - Regular text output from the model
- `tool_use` - Tool invocation with `name` and `input`

Within `user` messages (tool results):
- `tool_result` - Result of tool execution with `content`

The specific tools available to Kova's agent are: `Read`, `Glob`, `Grep`, `Write`, `Edit`, `Bash`, `Skill` (plus MCP tools).

---

## Proposed Design

### Phase 1: Structured Message Format (Backend)

**Goal:** Send structured content blocks to the frontend instead of a flat string.

#### 1.1 New Message Content Format

Instead of storing/sending `content` as a plain string, introduce a structured format. For backward compatibility, the `content` string in the DB remains as-is (for search, copy, etc.), but a new `contentBlocks` field carries structured data during streaming.

```typescript
// New types for structured content blocks
type ContentBlockType =
  | "text"           // Regular markdown text from the model
  | "tool_use"       // Tool invocation (collapsed by default)
  | "tool_result"    // Tool result (hidden by default, expandable)
  | "file_edit"      // File write/edit operation (special display)
  | "skill_use"      // Skill invocation
  | "bash"           // Bash command execution
  | "thinking"       // Future: thinking/reasoning blocks

interface TextBlock {
  type: "text";
  text: string;
}

interface ToolUseBlock {
  type: "tool_use";
  toolName: string;
  toolInput?: unknown;  // Available for detail view
  // Derived display properties:
  displayName: string;  // Human-friendly name (e.g., "Reading file" for Read)
  filePath?: string;    // Extracted from toolInput when applicable
}

interface ToolResultBlock {
  type: "tool_result";
  toolName: string;     // Which tool produced this result
  content?: unknown;    // The actual result data
  truncated?: boolean;  // Whether result was truncated
}

interface FileEditBlock {
  type: "file_edit";
  operation: "write" | "edit";
  filePath: string;
}

interface BashBlock {
  type: "bash";
  command: string;
}

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | FileEditBlock | BashBlock;
```

#### 1.2 Backend Changes (`chat-stream.handler.ts`)

Modify the SSE parsing to send structured deltas:

```typescript
// New delta message format
interface ChatStreamDelta {
  type: "chat:response:delta";
  chatId: number;
  delta: string;           // Keep for backward compat / plain text accumulation
  toolName?: string;       // Keep existing field
  // NEW structured fields:
  blockType?: ContentBlockType;
  blockData?: Partial<ContentBlock>;
}
```

- `text` events: send `{ blockType: "text", delta: event.text }`
- `tool_use` events: send `{ blockType: "tool_use", blockData: { toolName, toolInput, displayName, filePath } }`
  - Extract `filePath` from `toolInput` for Read/Write/Edit/Glob/Grep
  - Map tool names to human-friendly display names
- `tool_result` events: send `{ blockType: "tool_result", blockData: { toolName, content } }`
  - This data is currently completely ignored - we should forward it

The `assistantContent` string saved to DB stays as-is (flat markdown) for backward compatibility.

#### 1.3 Frontend Streaming State

Update the WebSocket client and streaming state to accumulate structured blocks:

```typescript
// In websocket_client.ts streaming content
interface StreamingContent {
  messages: Message[];
  assistantContent: string;        // Keep existing
  contentBlocks: ContentBlock[];   // NEW
}
```

### Phase 2: Semantic Chat Message Rendering (Frontend)

**Goal:** Render each content block with appropriate UI treatment.

#### 2.1 Content Block Components

Create specialized renderers for each block type:

**`TextBlock`**** renderer** - Current behavior, renders markdown via `KovaMarkdownParser`. This is the primary visible content.

**`ToolUseBlock`**** renderer** - Collapsible pill/chip showing:
- Tool icon + human-friendly label (e.g., "Reading app/page.tsx" or "Searching codebase")
- Collapsed by default during and after streaming
- Expandable to show tool input details
- Adjacent tool uses of the same type can be grouped (e.g., 3 file reads grouped into one collapsible)

**`FileEditBlock`**** renderer** - Special treatment for Write/Edit:
- Shows as "Editing `filename.tsx`" or "Creating `filename.tsx`" pill
- Could optionally show a diff preview on expand (future)

**`BashBlock`**** renderer** - Shows command being run:
- "Running `npm install`" pill
- Expandable to show the command

**`ToolResultBlock`**** renderer** - Hidden by default, available inside the parent tool_use expansion.

#### 2.2 Grouping Logic

Adjacent tool calls (without intervening text) should be grouped into a single collapsible section:

```
[Kova is working...]
  > Reading app/page.tsx
  > Reading app/layout.tsx
  > Searching for "useState"
[/collapsed]

Here's what I found. The component uses...
```

**Grouping rules:**
1. Consecutive `tool_use` + `tool_result` blocks without intervening `text` blocks form a group
2. Groups display as a single collapsible "Working..." block
3. During streaming, the current group shows an animated spinner with the latest tool being used
4. After streaming completes, groups show a summary (e.g., "Used 5 tools" or "Edited 3 files")

#### 2.3 Display States

Each message has two display modes:

**During Streaming (active):**
- Text blocks render immediately as they arrive
- Tool groups show as an animated "thinking" indicator with current tool label
- The latest tool action is visible (e.g., "Editing Index.tsx")
- Skeleton/shimmer effect on incomplete text

**After Streaming (complete):**
- Text blocks render as full markdown
- Tool groups collapse to a summary line
- Click to expand and see all tools used
- File edits show with bookmark/save icon

#### 2.4 Component Architecture

```
ChatMessage
├── ContentBlockRenderer (iterates over contentBlocks)
│   ├── TextBlockView (markdown rendering)
│   ├── ToolGroupView (collapsible group of tool calls)
│   │   ├── ToolUseChip (individual tool pill)
│   │   │   └── ToolDetailPanel (expanded view with input/output)
│   │   └── ToolGroupSummary (collapsed summary)
│   ├── FileEditChip (special treatment for Write/Edit)
│   └── BashChip (command execution display)
└── MessageFooter (timestamp, copy, commit info)
```

### Phase 3: Polish and Refinements

#### 3.1 Tool Name Display Mapping

Map internal tool names to user-friendly labels with icons:

| Tool Name | Display Label | Icon | Detail |
| --- | --- | --- | --- |
| `Read` | "Reading file" | FileText | Shows file path |
| `Write` | "Creating file" | FilePlus | Shows file path |
| `Edit` | "Editing file" | FileEdit | Shows file path |
| `Glob` | "Searching files" | Search | Shows pattern |
| `Grep` | "Searching code" | Search | Shows query |
| `Bash` | "Running command" | Terminal | Shows command |
| `Skill` | "Using skill" | Sparkles | Shows skill name |
| MCP tools | "Using [tool]" | Plug | Shows tool name |

#### 3.2 Animation & Transitions

- Smooth collapse/expand with `framer-motion` (already in the project)
- Tool chips slide in during streaming
- Collapse animation when streaming completes
- Subtle pulse/spin animation on active tool chip

#### 3.3 Backward Compatibility

- Old messages stored as plain `content` strings still render correctly
- The `KovaMarkdownParser` remains as fallback for messages without `contentBlocks`
- Detection: if `contentBlocks` array is present, use new renderer; otherwise fall back to markdown-only rendering
- During streaming: structured blocks are used; on save to DB, only the flat `content` string is stored (no schema migration needed)

---

## Implementation Plan

### Step 1: Define shared types
- Create `src/types/content-blocks.ts` with all block type definitions
- Add to both frontend and backend shared types

### Step 2: Backend - structured delta events
- Modify `chat-stream.handler.ts` to parse SSE events into structured deltas
- Add `blockType` and `blockData` to `ChatStreamDelta`
- Forward `tool_result` events (currently ignored)
- Extract file paths and human-friendly names from tool inputs

### Step 3: Frontend - WebSocket client changes
- Update `websocket_client.ts` to accumulate `contentBlocks[]` alongside `assistantContent`
- Update `ChatStreamCallbacks` to include block data
- Update streaming state atoms to carry structured data

### Step 4: Frontend - Content block components
- Create `src/components/chat/blocks/` directory
- Implement `TextBlockView`, `ToolGroupView`, `ToolUseChip`, `FileEditChip`, `BashChip`
- Implement grouping logic for adjacent tool calls

### Step 5: Frontend - Integration
- Update `ChatMessage.tsx` to use `ContentBlockRenderer`
- Keep fallback to `KovaMarkdownParser` for old/plain messages
- Handle both streaming and completed states

### Step 6: Polish
- Add animations with framer-motion
- Tool name mapping and icons
- Responsive collapsing behavior
- Test with various agent response patterns

---

## Files to Modify

### New Files
- `src/types/content-blocks.ts` - Shared content block type definitions
- `src/components/chat/blocks/ContentBlockRenderer.tsx` - Main block iterator
- `src/components/chat/blocks/TextBlockView.tsx` - Text/markdown rendering
- `src/components/chat/blocks/ToolGroupView.tsx` - Collapsible tool group
- `src/components/chat/blocks/ToolUseChip.tsx` - Individual tool pill
- `src/components/chat/blocks/FileEditChip.tsx` - File edit display
- `src/components/chat/blocks/BashChip.tsx` - Bash command display
- `src/components/chat/blocks/tool-display-config.ts` - Tool name/icon mapping

### Modified Files
- `backend/src/websocket/handlers/chat-stream.handler.ts` - Structured delta events
- `src/client/api/types.ts` - Extended `ChatStreamDelta` type
- `src/client/api/websocket_client.ts` - Content block accumulation
- `src/components/chat/ChatMessage.tsx` - Use ContentBlockRenderer
- `src/components/chat/KovaMarkdownParser.tsx` - May need minor updates
- `src/atoms/chatAtoms.ts` - Extended streaming state (if needed)

### Untouched
- `app-container/src/agent.ts` - Already produces structured events; no changes needed
- `packages/agent/` - No changes needed
- Database schema - No migration; `content` column stays as string

---

## Design References

The preferred experience (from the screenshots) shows:
- Clean text blocks for the model's narrative output
- Collapsible "activity" sections showing tool usage (e.g., "Editing Index.tsx", "Implementing theme toggle button now")
- Clear visual separation between conversational text and behind-the-scenes work
- Smooth transitions and compact display

This matches the pattern used by Claude.ai, Cursor, Lovable, and other modern AI coding tools.

## Visual Mockup

![Chat Feedback Display Upgrade Mockup](screenshot.png){mockup:nimbalyst-local/mockups/chat-feedback-display-upgrade.mockup.html}

The mockup shows four key states:
1. **Completed + Expanded** - Tool group shows "Edited 2 files" with checkmarks for each file
2. **Active/Streaming** - Spinner with current action label, active file highlighted in blue
3. **Collapsed** - Single "Used 8 tools" line with category badges (edits, reads, commands)
4. **Tool Variety** - Different tool types (search, read, bash, create, edit) with appropriate icons
