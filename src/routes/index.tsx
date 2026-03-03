import { createFileRoute } from '@tanstack/react-router'
import { useChat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { DefaultChatTransport } from 'ai'
import { useState, useCallback, useEffect, useMemo } from 'react'
import type { ChatMode, AgentStep, ArtifactData, MessageMetadata } from '@/types'
import { ARTIFACT_BLOCK_REGEX } from '@/lib/parsers/parse-analysis-response'
import { AppLayout } from '@/components/layout/app-layout'
import { ChatSidebar } from '@/components/sidebar/chat-sidebar'
import { ChatPanel } from '@/components/chat/chat-panel'
import { ArtifactPanel } from '@/components/artifact/artifact-panel'
import { useConversations } from '@/hooks/use-conversations'
import { useArtifact } from '@/hooks/use-artifact'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [mode, setMode] = useState<ChatMode>('metadata')
  const [input, setInput] = useState('')
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([])

  const {
    conversations,
    activeConversationId,
    createConversation,
    loadConversation,
    saveCurrentConversation,
    deleteConversation,
  } = useConversations()

  const {
    isOpen: isArtifactOpen,
    data: artifactData,
    activeTab: artifactTab,
    openArtifact,
    closeArtifact,
    setActiveTab: setArtifactTab,
  } = useArtifact()

  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/chat', body: { mode } }),
    [mode]
  )

  const {
    messages,
    sendMessage,
    status,
    setMessages,
  } = useChat<UIMessage<MessageMetadata>>({
    transport,
    onFinish({ message }) {
      // Keep steps visible as all-completed (don't clear)
      setAgentSteps([
        { agent: 'analyzer', status: 'completed' },
        { agent: 'clickhouse', status: 'completed' },
        { agent: 'analysis', status: 'completed' },
      ])
      extractArtifact(message)
    },
    onError() {
      // Mark whatever was running as error
      setAgentSteps((prev) =>
        prev.map((s) =>
          s.status === 'running' ? { ...s, status: 'error' } : s
        )
      )
    },
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  const extractArtifact = useCallback(
    (message: UIMessage) => {
      try {
        const text = message.parts
          .filter(
            (p): p is Extract<typeof p, { type: 'text' }> =>
              p.type === 'text'
          )
          .map((p) => p.text)
          .join('')
        const match = text.match(ARTIFACT_BLOCK_REGEX)
        if (match) {
          const artifact: ArtifactData = JSON.parse(match[1])
          openArtifact(artifact)
        }
      } catch {
        // no artifact in this message
      }
    },
    [openArtifact]
  )

  const handleNewChat = useCallback(() => {
    createConversation(mode)
    setMessages([])
    setInput('')
    setAgentSteps([])
    closeArtifact()
  }, [mode, createConversation, setMessages, closeArtifact])

  const handleSelectConversation = useCallback(
    (id: string) => {
      const conv = loadConversation(id)
      if (conv) {
        setMode(conv.mode)
        setMessages(conv.messages as UIMessage<MessageMetadata>[])
        setInput('')
        setAgentSteps([])
        closeArtifact()
      }
    },
    [loadConversation, setMessages, closeArtifact]
  )

  const handleSuggestedQuestion = useCallback(
    (question: string) => {
      if (!activeConversationId) {
        createConversation(mode)
      }
      setInput(question)
    },
    [activeConversationId, createConversation, mode]
  )

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    if (!activeConversationId) {
      createConversation(mode)
    }

    setAgentSteps([
      { agent: 'analyzer', status: 'running', message: 'Analyzing question' },
      { agent: 'clickhouse', status: 'pending' },
      { agent: 'analysis', status: 'pending' },
    ])

    sendMessage({ text: trimmed })
    setInput('')
  }, [input, isLoading, activeConversationId, createConversation, mode, sendMessage])

  // Step progression: driven entirely by real pipeline logs from the server.
  // The orchestrator sends incremental metadata as each agent/query completes.
  useEffect(() => {
    if (!isLoading) return

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    const logs = lastAssistant
      ? (lastAssistant as UIMessage & { metadata?: MessageMetadata }).metadata?.pipelineLogs
      : undefined

    if (logs) {
      const agentsInLogs = new Set(logs.entries.map((e) => e.agent))
      const analyzerDone = agentsInLogs.has('analyzer')
      const clickhouseDone = agentsInLogs.has('clickhouse')

      setAgentSteps([
        { agent: 'analyzer', status: analyzerDone ? 'completed' : 'running' },
        {
          agent: 'clickhouse',
          status: clickhouseDone
            ? 'completed'
            : analyzerDone
              ? 'running'
              : 'pending',
          message: 'Querying data',
        },
        {
          agent: 'analysis',
          status: clickhouseDone ? 'running' : 'pending',
          message: 'Preparing analysis',
        },
      ])
    } else if (status === 'streaming') {
      // Text streaming started but no metadata yet (edge case)
      setAgentSteps((prev) => {
        const analysisStep = prev.find((s) => s.agent === 'analysis')
        if (analysisStep?.status === 'running') return prev
        return [
          { agent: 'analyzer', status: 'completed' },
          { agent: 'clickhouse', status: 'completed' },
          { agent: 'analysis', status: 'running', message: 'Preparing analysis' },
        ]
      })
    }
  }, [messages, isLoading, status])

  // Save messages when they change
  useEffect(() => {
    if (messages.length > 0 && activeConversationId) {
      saveCurrentConversation(messages)
    }
  }, [messages.length])

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  )

  return (
    <AppLayout
      sidebar={
        <ChatSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={deleteConversation}
        />
      }
      chat={
        <ChatPanel
          messages={messages}
          input={input}
          isLoading={isLoading}
          mode={mode}
          agentSteps={agentSteps}
          onModeChange={setMode}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          conversationTitle={activeConversation?.title}
          onSuggestedQuestion={handleSuggestedQuestion}
        />
      }
      artifact={
        <ArtifactPanel
          data={artifactData}
          activeTab={artifactTab}
          onTabChange={(tab) => setArtifactTab(tab as 'table' | 'chart' | 'sql')}
          onClose={closeArtifact}
        />
      }
      isArtifactOpen={isArtifactOpen}
    />
  )
}
