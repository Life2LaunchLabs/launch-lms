'use client'

import { Plus } from 'lucide-react'
import { Button } from '@components/ui/button'
import { TimelineCanvas, TimelineCanvasEntry } from '@components/Objects/Timeline/TimelineCanvas'
import { RoadmapPathwayBlock, RoadmapPathwayDetail } from '@services/roadmap/blocks'

type RoadmapTimelineProps = {
  path: RoadmapPathwayDetail
  selectedUuid: string | null
  onSelect: (uuid: string) => void
  onAdd: () => void
}

const blockTypeLabels = {
  employment: 'Employment',
  learning: 'Learning',
  personal: 'Personal',
}

function money(value?: number | null) {
  if (value === null || value === undefined) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function titleFor(item: RoadmapPathwayBlock) {
  return item.title_override || item.block.title || 'Blank block'
}

function descriptionFor(item: RoadmapPathwayBlock) {
  return item.description_override || item.block.description || ''
}

function toCanvasEntry(item: RoadmapPathwayBlock): TimelineCanvasEntry {
  return {
    id: item.pathway_block_uuid,
    category: item.block.block_type === 'employment' ? 'work' : item.block.block_type === 'learning' ? 'education' : 'life',
    title: titleFor(item),
    description: descriptionFor(item),
    startDate: item.start_date,
    endDate: item.end_date || '',
    isOngoing: item.is_ongoing,
    employer: item.block.block_type === 'employment' ? blockTypeLabels[item.block.block_type] : '',
    institution: item.block.block_type === 'learning' ? blockTypeLabels[item.block.block_type] : '',
    eyebrow: blockTypeLabels[item.block.block_type],
    detail: blockTypeLabels[item.block.block_type],
    badgeCount: item.unmet_requirements.length || undefined,
    badgeLabel: item.unmet_requirements.length ? `${item.unmet_requirements.length} unmet` : undefined,
    meta: [
      item.block.cashflow_direction ? `${item.block.cashflow_direction === 'income' ? 'Income' : 'Expense'} ${money(item.block.cashflow_amount)} ${item.block.cashflow_period || ''}` : 'No cashflow',
    ],
  }
}

export default function RoadmapTimeline({ path, selectedUuid, onSelect, onAdd }: RoadmapTimelineProps) {
  return (
    <div className="min-w-[720px] p-6">
      <TimelineCanvas
        entries={path.blocks.map(toCanvasEntry)}
        selectedId={selectedUuid}
        emptyMessage="No roadmap blocks yet"
        onEntryClick={(entry) => onSelect(entry.id)}
      />
      <div className="mt-4">
        <Button type="button" variant="outline" onClick={onAdd}><Plus className="mr-2 h-4 w-4" />Add blank block</Button>
      </div>
    </div>
  )
}
