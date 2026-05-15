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
  occupation: 'Occupation',
  entrepreneurship: 'Entrepreneurship',
  education: 'Education',
  credential: 'Credential',
  job: 'Job',
  life: 'Life event',
  finance: 'Finance',
  custom: 'Custom',
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
    category: item.block.lane_category,
    title: titleFor(item),
    description: descriptionFor(item),
    startDate: item.start_date,
    endDate: item.end_date || '',
    isOngoing: item.is_ongoing,
    employer: item.block.lane_category === 'work' ? blockTypeLabels[item.block.block_type] : '',
    institution: item.block.lane_category === 'education' ? blockTypeLabels[item.block.block_type] : '',
    eyebrow: blockTypeLabels[item.block.block_type],
    detail: item.block.lane_category === 'life' ? 'Life' : blockTypeLabels[item.block.block_type],
    badgeCount: item.unmet_requirements.length || undefined,
    badgeLabel: item.unmet_requirements.length ? `${item.unmet_requirements.length} unmet` : undefined,
    meta: [
      `Income ${money(item.monthly_income_override ?? item.block.default_monthly_income)}/mo`,
      `Expense ${money(item.monthly_expense_override ?? item.block.default_monthly_expense)}/mo`,
      `One-time ${money(item.one_time_cost_override ?? item.block.default_one_time_cost)}`,
    ],
  }
}

export default function RoadmapTimeline({ path, selectedUuid, onSelect, onAdd }: RoadmapTimelineProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
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
