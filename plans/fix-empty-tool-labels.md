---
planStatus:
  planId: plan-fix-empty-tool-labels
  title: Fix empty "Using" labels for Skill and TodoWrite tools
  status: draft
  planType: bug-fix
  priority: high
  owner: claude
  stakeholders: []
  tags:
    - chat-feedback
    - ui
  created: "2026-02-21"
  updated: "2026-02-22T00:00:00.000Z"
  progress: 0
---
# Fix Empty "Using" Labels + Remove Debug Logging

## Problem

1. **Skill tool** shows "Using" with no detail. Should show "Using init-project skill" (the skill name is in `toolInput.skill`)
2. **TodoWrite tool** shows "Using" with no detail. Should show "Planning" with the active task description (from `toolInput.todos`)
3. **Debug \****`console.log`**\*\* statements** left in from troubleshooting need to be removed

## Root Cause

The backend `buildBlockData()` in `chat-stream.handler.ts` only handles Write, Edit, Bash, Glob, Grep. For Skill and TodoWrite, it falls through to the generic `tool_use` return which sends `displayName: "Using skill"` / `"Using TodoWrite"` with no detail.

The app-container **does** send `toolInput` for these tools:
- Skill: `{"skill": "init-project"}`
- TodoWrite: `{"todos": [{"content": "Copy template files", "status": "in_progress", ...}]}`

## Changes

### 1. Backend: `backend/src/websocket/handlers/chat-stream.handler.ts`

**Add TodoWrite to \****`TOOL_DISPLAY_NAMES`**\*\*:**
```typescript
TodoWrite: "Planning",
```

**Update \****`buildBlockData()`**\*\* to handle Skill and TodoWrite:**
```typescript
// After the existing Bash check and before the generic return:

// Skill tool - extract skill name for display
if (toolName === "Skill") {
  const skillName = (toolInput as any)?.skill as string | undefined;
  return {
    type: "tool_use",
    toolName: "Skill",
    displayName: skillName ? `Using ${skillName} skill` : "Using skill",
    skillName,
  };
}

// TodoWrite - extract the active task for display
if (toolName === "TodoWrite") {
  const todos = (toolInput as any)?.todos as Array<{content: string; status: string}> | undefined;
  const activeTask = todos?.find(t => t.status === "in_progress")?.content;
  return {
    type: "tool_use",
    toolName: "TodoWrite",
    displayName: "Planning",
    activeTask,
  };
}
```

### 2. Frontend: `src/components/chat/blocks/tool-display-config.ts`

**Add TodoWrite to \****`TOOL_DISPLAY_MAP`**\*\*:**
```typescript
TodoWrite: { label: "Planning", icon: ListTodo },  // import ListTodo from lucide-react
```

**Update \****`extractToolDetails()`**\*\* to handle Skill and TodoWrite:**
```typescript
case "Skill":
  return { pattern: input.skill as string };

case "TodoWrite": {
  const todos = input.todos as Array<{content: string; status: string}> | undefined;
  const active = todos?.find(t => t.status === "in_progress");
  return { pattern: active?.content };
}
```

### 3. Frontend: `src/components/chat/blocks/ToolUseChip.tsx`

Update `getChipInfo()` to display `blockData.activeTask` or `blockData.skillName` when available from tool_use blocks.

### 4. Remove debug logging

**`src/client/api/websocket_client.ts`****:** Remove two `console.log` lines:
- `console.log("[WS] Delta received:", ...)`
- `console.log("[WS] Sending update with contentBlocks:", ...)`

**`src/components/chat/ChatMessage.tsx`****:** Remove the debug log block:
- `if (message.role === "assistant" && isLastMessage) { console.log("[ChatMessage] Rendering assistant:", ...) }`

## Files to Modify

1. `backend/src/websocket/handlers/chat-stream.handler.ts` - Add Skill/TodoWrite handling
2. `src/components/chat/blocks/tool-display-config.ts` - Add TodoWrite display, Skill detail
3. `src/components/chat/blocks/ToolUseChip.tsx` - Display skill name and active task
4. `src/client/api/websocket_client.ts` - Remove debug logs
5. `src/components/chat/ChatMessage.tsx` - Remove debug log
