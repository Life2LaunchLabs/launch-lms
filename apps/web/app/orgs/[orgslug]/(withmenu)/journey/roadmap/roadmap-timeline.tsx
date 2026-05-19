'use client'

import { TimelineCanvas, TimelineCanvasEntry } from '@components/Objects/Timeline/TimelineCanvas'
import { RoadmapPathwayBlock, RoadmapPathwayDetail } from '@services/roadmap/blocks'

type RoadmapTimelineProps = {
  path: RoadmapPathwayDetail
  selectedUuid: string | null
  onSelect: (uuid: string) => void
  onMove: (uuid: string, placement: { startDate: string; endDate: string; isOngoing: boolean }) => void
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

export default function RoadmapTimeline({ path, selectedUuid, onSelect, onMove }: RoadmapTimelineProps) {
  return (
    <div className="h-full min-h-0 min-w-0">
      <TimelineCanvas
        entries={path.blocks.map(toCanvasEntry)}
        selectedId={selectedUuid}
        emptyMessage="No roadmap blocks yet"
        variant="roadmap"
        onEntryClick={(entry) => onSelect(entry.id)}
        onEntryMove={(entry, placement) => onMove(entry.id, placement)}
      />
    </div>
  )
}
