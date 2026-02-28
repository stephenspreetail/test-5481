import { BarChart3 } from 'lucide-react'

export function EmptyArtifact() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <BarChart3 className="h-12 w-12 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Query results will appear here
      </p>
    </div>
  )
}
