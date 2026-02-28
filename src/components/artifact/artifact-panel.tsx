import type { ArtifactData } from '@/types'
import { ArtifactHeader } from './artifact-header'
import { ArtifactTabs } from './artifact-tabs'
import { EmptyArtifact } from './empty-artifact'

interface ArtifactPanelProps {
  data: ArtifactData | null
  activeTab: string
  onTabChange: (tab: string) => void
  onClose: () => void
}

export function ArtifactPanel({
  data,
  activeTab,
  onTabChange,
  onClose,
}: ArtifactPanelProps) {
  return (
    <div className="flex h-full flex-col border-l bg-background">
      <ArtifactHeader title={data?.title ?? 'Results'} onClose={onClose} />
      {!data ? (
        <EmptyArtifact />
      ) : (
        <ArtifactTabs data={data} activeTab={activeTab} onTabChange={onTabChange} />
      )}
    </div>
  )
}
