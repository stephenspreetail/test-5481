import { useState, useCallback } from 'react'
import type { ArtifactData } from '@/types'

type ArtifactTab = 'table' | 'chart' | 'sql'

export function useArtifact() {
  const [isOpen, setIsOpen] = useState(false)
  const [data, setData] = useState<ArtifactData | null>(null)
  const [activeTab, setActiveTab] = useState<ArtifactTab>('table')

  const openArtifact = useCallback((artifactData: ArtifactData) => {
    setData(artifactData)
    setIsOpen(true)
    setActiveTab('table')
  }, [])

  const closeArtifact = useCallback(() => {
    setIsOpen(false)
    setData(null)
  }, [])

  return {
    isOpen,
    data,
    activeTab,
    openArtifact,
    closeArtifact,
    setActiveTab,
  }
}
