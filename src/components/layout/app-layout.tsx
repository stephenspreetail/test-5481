import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'

interface AppLayoutProps {
  sidebar: React.ReactNode
  chat: React.ReactNode
  artifact: React.ReactNode
  isArtifactOpen: boolean
}

export function AppLayout({
  sidebar,
  chat,
  artifact,
  isArtifactOpen,
}: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-background">
      <PanelGroup direction="horizontal">
        <Panel defaultSize={15} minSize={12} maxSize={25}>
          {sidebar}
        </Panel>
        <PanelResizeHandle className="w-px bg-border hover:bg-primary transition-colors" />
        <Panel minSize={30}>
          {chat}
        </Panel>
        {isArtifactOpen && (
          <>
            <PanelResizeHandle className="w-px bg-border hover:bg-primary transition-colors" />
            <Panel defaultSize={30} minSize={20}>
              {artifact}
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  )
}
