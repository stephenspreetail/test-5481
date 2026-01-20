# Streaming Architecture

This doc explains how Kova streams AI responses from containers to the frontend. If something is out of date, please feel free to suggest a change via a pull request.

## Overview

Kova uses a **two-hop streaming architecture**:

1. **Container → Backend**: Server-Sent Events (SSE) over HTTP
2. **Backend → Frontend**: WebSocket (bidirectional)

The backend acts as a protocol bridge, translating SSE events from containers into WebSocket messages for the frontend.

## The Analogy: A Translator at a Conference

Think of it like a live translation setup:

- **Container** speaks "SSE" (one-way broadcast, like a radio station)
- **Backend** is the translator with headphones AND a microphone
- **Frontend** is connected via a **two-way walkie-talkie** (WebSocket)

The translator listens to the radio, then speaks into the walkie-talkie. But the walkie-talkie also lets the audience ask questions back.

## Architecture Diagram

```
  FRONTEND                    BACKEND                      CONTAINER
     │                           │                             │
     │  ──── WebSocket ────────▶ │                             │
     │   "chat:stream"           │                             │
     │   (user's prompt)         │                             │
     │                           │  ──── HTTP POST /query ───▶ │
     │                           │       (prompt payload)      │
     │                           │                             │
     │                           │  ◀════ SSE Stream ════════  │
     │                           │    event: text              │
     │                           │    data: {"content":"Hi"}   │
     │                           │                             │
     │  ◀──── WebSocket ───────  │                             │
     │   "chat:response:delta"   │                             │
     │   (parsed & forwarded)    │                             │
     │                           │                             │
     ▼                           ▼                             ▼

   BIDIRECTIONAL              TRANSLATOR              ONE-WAY BROADCAST
   (walkie-talkie)            (protocol bridge)       (radio station)
```

## Container → Backend Communication (SSE)

### How It Works

When the backend needs to execute an AI prompt, it sends an HTTP POST to the container's agent server and receives a streaming SSE response:

```typescript
// backend/src/websocket/handlers/chat-stream.handler.ts
const response = await fetch(`http://localhost:${agentPort}/query`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  },
  body: JSON.stringify({
    prompt: fullPrompt,
    sessionId,
    allowedTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
    },
  }),
});
```

### SSE Event Types

The container streams these event types:

| Event Type | Description | Data |
|------------|-------------|------|
| `session_init` | New session created | `{ sessionId }` |
| `text` | Text output from Claude | `{ content }` |
| `tool_use` | Tool being executed | `{ toolName, input }` |
| `tool_result` | Tool execution result | `{ output }` |
| `result` | Final response | `{ cost, duration }` |
| `error` | Error occurred | `{ message }` |

### Why SSE for Container → Backend?

- **Simpler implementation** - Container just streams data out, no need to handle incoming messages
- **HTTP-based** - Works through standard proxies and load balancers
- **Natural fit** - AI responses are inherently one-way streams

## Backend → Frontend Communication (WebSocket)

### WebSocket is Bidirectional

A common misconception is that WebSocket handlers only receive messages. In Kova, the same `ws` connection is used for **both directions**:

| Direction | Message Type | Purpose |
|-----------|--------------|---------|
| Frontend → Backend | `chat:stream` | User sends a prompt |
| Frontend → Backend | `chat:cancel` | User aborts generation |
| Frontend → Backend | `subscribe:app` | Start watching app output |
| **Backend → Frontend** | `chat:response:delta` | Stream AI text chunks |
| **Backend → Frontend** | `chat:response:end` | Signal completion |
| **Backend → Frontend** | `chat:response:error` | Report errors |
| **Backend → Frontend** | `chat:title:update` | Auto-generated chat title |
| **Backend → Frontend** | `app:name:update` | Auto-generated app name |

### The Protocol Bridge

The backend reads SSE events and translates them to WebSocket messages:

```typescript
// backend/src/websocket/handlers/chat-stream.handler.ts
const reader = response.body.getReader();

while (true) {
  const { done, value } = await reader.read();
  // Parse SSE format: "event: text\ndata: {...}\n\n"

  switch (event.type) {
    case "text":
      // Forward to frontend via WebSocket
      ws.send({ type: "chat:response:delta", text: event.data });
      break;
    case "tool_use":
      // Track file modifications, forward tool name
      ws.send({ type: "chat:response:delta", toolName: event.toolName });
      break;
    case "result":
      // Signal completion with metadata
      ws.send({ type: "chat:response:end", cost, duration, sessionId });
      break;
  }
}
```

### Why WebSocket for Backend → Frontend?

- **Bidirectional** - User can send prompts AND cancel mid-stream
- **Persistent connection** - No connection overhead per message
- **Real-time** - Sub-millisecond latency for streaming text

## Full Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│                         (React SPA :5174)                               │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ WebSocket (bidirectional)
                                 │
                                 │  ↓ chat:stream (prompt)
                                 │  ↓ chat:cancel (abort)
                                 │  ↑ chat:response:delta (text chunks)
                                 │  ↑ chat:response:end (completion)
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                     │
│                         (Fastify :3002)                                 │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  WebSocket Handler (chat-stream.handler.ts)                       │  │
│  │                                                                    │  │
│  │  1. Receive prompt from frontend                                  │  │
│  │  2. Ensure container is running                                   │  │
│  │  3. POST to container's /query endpoint                           │  │
│  │  4. Read SSE stream, forward events to frontend                   │  │
│  │  5. Handle cancellation via AbortController                       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ HTTP + SSE (one-way stream)
                                    │
                                    │  ↓ POST /query (prompt)
                                    │  ↑ SSE: text, tool_use, result
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           APP-CONTAINER                                  │
│                          (app-{appId})                                  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Agent Server (Fastify :3100)                                     │  │
│  │                                                                    │  │
│  │  - Runs Claude Agent SDK                                          │  │
│  │  - Executes tools (Read, Write, Edit, Bash, etc.)                │  │
│  │  - Streams events as SSE                                          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Dev Server (Vite :3000)                                          │  │
│  │  - Serves the generated app                                       │  │
│  │  - Hot-reloads on file changes                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Cancellation Flow

When a user cancels a streaming request:

```
Frontend                    Backend                      Container
    │                          │                             │
    │  chat:cancel ──────────▶ │                             │
    │                          │                             │
    │                          │  abortController.abort() ─▶ │
    │                          │                             │
    │                          │  ◀── Connection closed ──── │
    │                          │                             │
    │  ◀── chat:response:end   │                             │
    │      (cancelled: true)   │                             │
```

The backend uses an `AbortController` to cancel the fetch request to the container, which terminates the SSE stream.

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/websocket/handlers/chat-stream.handler.ts` | WebSocket handler, SSE parsing, response streaming |
| `backend/src/websocket/index.ts` | WebSocket server setup, message routing |
| `backend/src/services/app-container.service.ts` | Container lifecycle management |
| `app-container/src/server.ts` | Container's Fastify server, `/query` endpoint |
| `app-container/src/agent.ts` | Claude Agent SDK integration, SSE event emission |
| `src/client/api/websocket_client.ts` | Frontend WebSocket client |

## Common Gotchas

### 1. WebSocket handlers are bidirectional

Don't assume WebSocket handlers only receive messages. The same `ws` object sends responses:

```typescript
// This handler RECEIVES a message AND SENDS multiple responses
export async function handleChatStream(ws, message) {
  const { prompt } = message;  // Received from frontend

  // ... process ...

  ws.send({ type: "chat:response:delta", text: "..." });  // Sent TO frontend
  ws.send({ type: "chat:response:end" });                 // Sent TO frontend
}
```

### 2. SSE parsing requires buffering

SSE events can be split across multiple chunks. The backend must buffer and parse:

```
Chunk 1: "event: text\nda"
Chunk 2: "ta: {\"content\":\"Hello\"}\n\nevent: tex"
Chunk 3: "t\ndata: {\"content\":\" world\"}\n\n"
```

### 3. Container must be running before query

The backend ensures the container is started and healthy before sending queries. This adds latency to the first request for a new app.
