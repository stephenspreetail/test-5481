sequenceDiagram
    participant User
    participant Browser as React UI<br/>(Browser SPA)
    participant WSClient as WebSocket Client<br/>(websocket_client.ts)
    participant Backend as Backend API<br/>(Fastify)
    participant DB as PostgreSQL<br/>(Drizzle ORM)
    participant Container as App Container<br/>(Docker)
    participant Agent as Agent Server<br/>(Claude Agent SDK)
    participant Claude as Claude API<br/>(Anthropic)

    User->>Browser: Enter prompt in chat UI
    Browser->>WSClient: streamChat(chatId, prompt)
    WSClient->>Backend: WebSocket message<br/>{type: "chat:stream", chatId, prompt}
    
    Backend->>DB: Verify chat ownership<br/>Get app info
    DB-->>Backend: Chat & App data
    
    Backend->>DB: Save user message
    Backend->>WSClient: chat:response:chunk<br/>(user message)
    WSClient->>Browser: onUpdate(messages)
    Browser->>User: Display user message
    
    Backend->>Container: Check if running
    alt Container not running
        Backend->>Container: Start container<br/>(Docker API)
        Container->>Agent: Initialize agent server
        Agent-->>Container: Ready on port
    end
    
    Backend->>Container: POST /query<br/>{prompt, sessionId, allowedTools}
    Container->>Agent: streamQuery(prompt, options)
    Agent->>Claude: Start streaming request
    
    loop Stream events
        Claude-->>Agent: SDK Messages
        Agent->>Agent: Process & format events
        Agent-->>Container: AgentStreamEvent
        Container-->>Backend: SSE stream<br/>(text/event-stream)
        
        Backend->>Backend: Parse SSE events
        
        alt Event: text
            Backend->>WSClient: chat:response:delta<br/>{delta, chatId}
            WSClient->>Browser: onDelta(text)
            Browser->>User: Display streaming text
        else Event: tool_use
            Backend->>WSClient: chat:response:delta<br/>{delta: "[Using tool]"}
            WSClient->>Browser: onDelta(toolName)
            Browser->>User: Show tool indicator
            Agent->>Agent: Execute tool<br/>(Read/Write/Bash/etc)
        else Event: result
            Backend->>Backend: Extract metadata<br/>(cost, duration)
        end
    end
    
    Backend->>DB: Save assistant message
    Backend->>WSClient: chat:response:chunk<br/>(assistant message)
    WSClient->>Browser: onUpdate(messages)
    
    Backend->>WSClient: chat:response:end<br/>{updatedFiles, sessionId, cost}
    WSClient->>Browser: onEnd(response)
    Browser->>User: Show complete response
    
    opt If files updated
        Browser->>Browser: Reload preview iframe
    end
