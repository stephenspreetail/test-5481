import { Button } from '@spreetail/spreeform'
import { X } from 'lucide-react'

interface ArtifactHeaderProps {
  title: string
  onClose: () => void
}

export function ArtifactHeader({ title, onClose }: ArtifactHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <h2 className="text-sm font-semibold truncate">{title}</h2>
      <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
