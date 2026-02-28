import {
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@spreetail/spreeform'
import { Database, Search } from 'lucide-react'
import type { ChatMode } from '../../types'

interface ModeSelectorProps {
  mode: ChatMode
  onModeChange: (mode: ChatMode) => void
}

export function ModeSelector({ mode, onModeChange }: ModeSelectorProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(value) => {
          if (value) onModeChange(value as ChatMode)
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="metadata" aria-label="Metadata mode">
              <Database size={16} className="mr-1.5" />
              Metadata
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>Schema pre-loaded from metadata file</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <ToggleGroupItem value="discovery" aria-label="Discovery mode">
              <Search size={16} className="mr-1.5" />
              Discovery
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>Explore schema dynamically</TooltipContent>
        </Tooltip>
      </ToggleGroup>
    </TooltipProvider>
  )
}
