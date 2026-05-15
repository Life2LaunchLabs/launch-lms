'use client'

import React, { useMemo } from 'react'
import { Briefcase, GraduationCap, Heart, Pencil } from 'lucide-react'

export type TimelineCategory = 'work' | 'education' | 'life'

export type TimelineCanvasEntry = {
  id: string
  category: TimelineCategory
  title: string
  description?: string
  startDate: string
  endDate?: string
  isOngoing?: boolean
  employer?: string
  institution?: string
  eyebrow?: string
  detail?: string
  badgeCount?: number
  badgeLabel?: string
  meta?: string[]
}

type MonthMarker = {
  key: string
  year: number
  month: number
  top: number
}

type TimelineCanvasProps = {
  entries: TimelineCanvasEntry[]
  selectedId?: string | null
  canInteract?: boolean
  emptyMessage?: string
  onEntryClick?: (entry: TimelineCanvasEntry) => void
}

const CATEGORY_CONFIG: Record<TimelineCategory, {
  label: string
  accent: string
  icon: React.ComponentType<{ className?: string }>
}> = {
  work: {
    label: 'Work',
    accent: 'bg-sky-500',
    icon: Briefcase,
  },
  education: {
    label: 'Education',
    accent: 'bg-emerald-500',
    icon: GraduationCap,
  },
  life: {
    label: 'Life',
    accent: 'bg-rose-500',
    icon: Heart,
  },
}

const TIMELINE_CARD_WIDTH = 220
const TIMELINE_LANE_GAP = 12
const TIMELINE_COLUMN_PADDING = 24
const TIMELINE_LABEL_COLUMN_WIDTH = 48
const TIMELINE_DEFAULT_MONTH_HEIGHT = 16
const TIMELINE_ENDPOINT_MONTH_HEIGHT = 28
const MIN_TIMELINE_CARD_HEIGHT = 136
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })
const MONTH_ONLY_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short' })

function getEffectiveEndDate(entry: TimelineCanvasEntry) {
  if (entry.isOngoing || !entry.endDate) {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  }
  return entry.endDate
}

function getMonthIndex(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) return null
  return { year, month }
}

function monthKey(value: string) {
  const parsed = getMonthIndex(value)
  if (!parsed) return Number.NaN
  return parsed.year * 12 + (parsed.month - 1)
}

function formatMonth(value?: string) {
  const parsed = value ? getMonthIndex(value) : null
  if (!parsed) return ''
  return MONTH_FORMATTER.format(new Date(parsed.year, parsed.month - 1, 1))
}

function formatMonthLabel(month: number) {
  return MONTH_ONLY_FORMATTER.format(new Date(2024, month - 1, 1))
}

function getMonthTop(row: { top: number; height: number; monthHeights?: number[] }, month: number) {
  if (row.monthHeights) {
    let offset = 0
    for (let currentMonth = 12; currentMonth > month; currentMonth -= 1) {
      offset += row.monthHeights[currentMonth] ?? TIMELINE_DEFAULT_MONTH_HEIGHT
    }
    return row.top + offset
  }
  return row.top + ((12 - month) / 12) * row.height
}

function getMonthBottom(row: { top: number; height: number; monthHeights?: number[] }, month: number) {
  if (row.monthHeights) {
    return getMonthTop(row, month) + (row.monthHeights[month] ?? TIMELINE_DEFAULT_MONTH_HEIGHT)
  }
  return row.top + ((13 - month) / 12) * row.height
}

function formatEntryRange(entry: TimelineCanvasEntry) {
  const start = formatMonth(entry.startDate)
  const end = entry.isOngoing ? 'Present' : formatMonth(entry.endDate)
  if (!start) return end
  if (!end) return start
  return `${start} - ${end}`
}

function sortTimelineEntries(entries: TimelineCanvasEntry[]) {
  return [...entries].sort((a, b) => {
    const endDiff = monthKey(getEffectiveEndDate(b)) - monthKey(getEffectiveEndDate(a))
    if (endDiff !== 0) return endDiff
    return monthKey(b.startDate) - monthKey(a.startDate)
  })
}

function getMonthsBetween(start: { year: number; month: number }, end: { year: number; month: number }) {
  const startKey = start.year * 12 + (start.month - 1)
  const endKey = end.year * 12 + (end.month - 1)
  if (endKey < startKey) return []

  const months: Array<{ year: number; month: number }> = []
  for (let key = startKey; key <= endKey; key += 1) {
    months.push({
      year: Math.floor(key / 12),
      month: (key % 12) + 1,
    })
  }
  return months
}

function buildTimelineRows(entries: TimelineCanvasEntry[]) {
  if (entries.length === 0) {
    const currentYear = new Date().getFullYear()
    return {
      rows: [{ kind: 'year', year: currentYear, height: 220 }] as any[],
      minYear: currentYear,
      maxYear: currentYear,
    }
  }

  const monthSpans = entries.flatMap((entry) => {
    const start = getMonthIndex(entry.startDate)
    const end = getMonthIndex(getEffectiveEndDate(entry))
    if (!start || !end) return []
    const months = getMonthsBetween(start, end)
    if (months.length === 0) return []
    return [{ entry, months, start, end }]
  })
  const years = monthSpans.flatMap(({ months }) => months.map((month) => month.year))
  const eventYears = new Set<number>()
  const monthHeightsByYear = new Map<number, number[]>()
  const endpointMonthsByYear = new Map<number, Set<number>>()
  const getMonthHeights = (year: number) => {
    const existing = monthHeightsByYear.get(year)
    if (existing) return existing
    const monthHeights = Array(13).fill(TIMELINE_DEFAULT_MONTH_HEIGHT)
    monthHeightsByYear.set(year, monthHeights)
    return monthHeights
  }
  const addEndpointMonth = (year: number, month: number) => {
    const existing = endpointMonthsByYear.get(year) ?? new Set<number>()
    existing.add(month)
    endpointMonthsByYear.set(year, existing)
  }

  monthSpans.forEach(({ entry, start, end }) => {
    eventYears.add(start.year)
    eventYears.add(end.year)
    addEndpointMonth(start.year, start.month)
    if (!entry.isOngoing) addEndpointMonth(end.year, end.month)
  })

  monthSpans.forEach(({ months }) => {
    const requiredMonthHeight = MIN_TIMELINE_CARD_HEIGHT / Math.max(1, months.length)
    months.filter((month) => eventYears.has(month.year)).forEach(({ year: monthYear, month }) => {
      const monthHeights = getMonthHeights(monthYear)
      monthHeights[month] = Math.max(monthHeights[month], requiredMonthHeight)
    })
  })

  endpointMonthsByYear.forEach((months, year) => {
    const monthHeights = getMonthHeights(year)
    months.forEach((month) => {
      monthHeights[month] = Math.max(monthHeights[month], TIMELINE_ENDPOINT_MONTH_HEIGHT)
    })
  })

  const maxYear = Math.max(new Date().getFullYear(), ...years)
  const minYear = Math.min(...years)
  const rows: any[] = []
  let year = maxYear

  while (year >= minYear) {
    if (eventYears.has(year)) {
      const monthHeights = getMonthHeights(year)
      const height = monthHeights.slice(1).reduce((sum, monthHeight) => sum + monthHeight, 0)
      rows.push({
        kind: 'year',
        year,
        height,
        monthHeights,
      })
      year -= 1
      continue
    }

    const gapStart = year
    while (year >= minYear) {
      if (eventYears.has(year)) break
      year -= 1
    }
    const gapEnd = year + 1
    rows.push({
      kind: 'gap',
      startYear: gapStart,
      endYear: gapEnd,
      height: 28 + Math.min(2, Math.max(0, gapStart - gapEnd)) * 10,
    })
  }

  return { rows, minYear, maxYear }
}

function buildLayout(entries: TimelineCanvasEntry[]) {
  const validEntries = entries.filter((entry) => {
    const start = getMonthIndex(entry.startDate)
    const end = getMonthIndex(getEffectiveEndDate(entry))
    return Boolean(start && end && monthKey(entry.startDate) <= monthKey(getEffectiveEndDate(entry)))
  })
  const { rows } = buildTimelineRows(validEntries)

  let offset = 0
  const yearMap = new Map<number, { top: number; height: number; monthHeights?: number[] }>()
  const rowOffsets = rows.map((row) => {
    const currentTop = offset
    offset += row.height
    if (row.kind === 'year') {
      yearMap.set(row.year, { top: currentTop, height: row.height, monthHeights: row.monthHeights })
    }
    return { ...row, top: currentTop }
  })

  const totalHeight = Math.max(offset + 16, validEntries.length === 0 ? 320 : 520)
  const monthMarkersByKey = new Map<string, MonthMarker>()
  const events = sortTimelineEntries(validEntries).map((entry) => {
    const start = getMonthIndex(entry.startDate)!
    const end = getMonthIndex(getEffectiveEndDate(entry))!
    const startRow = yearMap.get(start.year)!
    const endRow = yearMap.get(end.year)!
    const rawTop = entry.isOngoing ? 0 : getMonthTop(endRow, end.month)
    const bottom = getMonthBottom(startRow, start.month)
    const top = Math.max(0, rawTop)
    const height = Math.min(Math.max(0, bottom - top), Math.max(0, totalHeight - top - 16))
    return {
      ...entry,
      sortTop: top,
      top,
      height,
      lane: 0,
      laneCount: 1,
    }
  })

  validEntries.forEach((entry) => {
    const start = getMonthIndex(entry.startDate)
    const end = getMonthIndex(getEffectiveEndDate(entry))
    if (start) {
      const startRow = yearMap.get(start.year)
      if (startRow) {
        monthMarkersByKey.set(`${start.year}-${start.month}`, {
          key: `${start.year}-${start.month}`,
          year: start.year,
          month: start.month,
          top: getMonthBottom(startRow, start.month),
        })
      }
    }
    if (end && !entry.isOngoing) {
      const endRow = yearMap.get(end.year)
      if (endRow) {
        monthMarkersByKey.set(`${end.year}-${end.month}`, {
          key: `${end.year}-${end.month}`,
          year: end.year,
          month: end.month,
          top: getMonthTop(endRow, end.month),
        })
      }
    }
  })

  events.sort((a, b) => a.sortTop - b.sortTop)

  const lanes: number[] = []
  events.forEach((entry) => {
    let laneIndex = 0
    while (laneIndex < lanes.length && lanes[laneIndex] > entry.top + 12) {
      laneIndex += 1
    }
    lanes[laneIndex] = entry.top + entry.height
    entry.lane = laneIndex
  })
  const laneCount = Math.max(1, lanes.length)
  const columnWidth = TIMELINE_COLUMN_PADDING + (laneCount * TIMELINE_CARD_WIDTH) + ((laneCount - 1) * TIMELINE_LANE_GAP)

  return {
    rows: rowOffsets,
    monthMarkers: [...monthMarkersByKey.values()].sort((a, b) => a.top - b.top),
    totalHeight,
    events: events.map((entry) => ({
      ...entry,
      laneCount,
    })),
    columnWidth,
  }
}

export function TimelineCanvas({
  entries,
  selectedId,
  canInteract = true,
  emptyMessage = 'No timeline entries yet',
  onEntryClick,
}: TimelineCanvasProps) {
  const layout = useMemo(() => buildLayout(entries), [entries])
  const timelineGridTemplate = useMemo(
    () => `${TIMELINE_LABEL_COLUMN_WIDTH}px minmax(0, 1fr)`,
    []
  )

  if (!entries.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-16 text-center">
        <p className="text-base font-semibold text-gray-800">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="relative grid gap-2 sm:gap-3" style={{ gridTemplateColumns: timelineGridTemplate }}>
      <div className="relative" style={{ height: layout.totalHeight }}>
        {layout.rows.map((row) => (
          row.kind === 'year' ? (
            <div key={`year-${row.year}`} className="absolute left-0 right-0" style={{ top: row.top, height: row.height }}>
              <div className="absolute right-0 flex h-5 -translate-y-1/2 items-center pr-1 text-right text-xs font-semibold text-gray-500 sm:pr-2 sm:text-sm" style={{ top: 0 }}>
                {row.year}
              </div>
            </div>
          ) : (
            <div key={`gap-${row.startYear}-${row.endYear}`} className="absolute left-0 right-0" style={{ top: row.top, height: row.height }}>
              <div className="absolute right-0 flex h-5 -translate-y-1/2 items-center pr-1 text-right text-xs font-semibold text-gray-500 sm:pr-2 sm:text-sm" style={{ top: 0 }}>
                {row.startYear}
              </div>
              <div className="flex h-full items-center justify-end pr-1 text-xs tracking-[0.25em] text-gray-300 sm:pr-2 sm:text-sm sm:tracking-[0.45em]">
                ...
              </div>
            </div>
          )
        ))}
        {layout.monthMarkers.map((marker) => (
          <div
            key={`month-${marker.key}`}
            className="absolute left-0 right-0 pr-1 text-right text-[10px] font-medium text-gray-400 sm:pr-2 sm:text-xs"
            style={{ top: marker.top - 8 }}
          >
            {formatMonthLabel(marker.month)}
          </div>
        ))}
      </div>

      <div className="min-w-0 overflow-x-auto pb-4">
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50" style={{ width: layout.columnWidth, height: layout.totalHeight }}>
          {layout.rows.map((row) => (
            <div
              key={`timeline-${row.kind === 'year' ? row.year : `${row.startYear}-${row.endYear}`}`}
              className="absolute left-0 right-0 border-b border-gray-100/80"
              style={{ top: row.top, height: row.height }}
            >
              <div className={`absolute inset-y-0 left-0 w-full bg-gray-900 ${row.kind === 'year' ? 'opacity-[0.025]' : 'opacity-[0.015]'}`} />
              <div className="absolute left-0 top-0 h-px w-full bg-current text-gray-300" />
              {row.kind === 'gap' ? (
                <div className="absolute left-0 top-1/2 w-full -translate-y-1/2 text-center text-xs tracking-[0.4em] text-gray-300">...</div>
              ) : null}
            </div>
          ))}

          {[...layout.events].sort((a, b) => a.sortTop - b.sortTop).map((entry) => {
            const canvasEntry = entry as TimelineCanvasEntry & typeof entry
            const config = CATEGORY_CONFIG[canvasEntry.category]
            const left = 12 + (canvasEntry.lane * (TIMELINE_CARD_WIDTH + TIMELINE_LANE_GAP))
            const detail = canvasEntry.detail ?? (canvasEntry.category === 'work' ? canvasEntry.employer : canvasEntry.category === 'education' ? canvasEntry.institution : '')
            const selected = selectedId === canvasEntry.id

            return (
              <button
                key={canvasEntry.id}
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={canInteract ? () => onEntryClick?.(canvasEntry) : undefined}
                tabIndex={canInteract ? 0 : -1}
                aria-label={canInteract ? `Open ${canvasEntry.title}` : undefined}
                className={`absolute z-10 overflow-hidden rounded-xl border bg-white p-3 text-left shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] transition ${selected ? 'border-gray-950 ring-2 ring-gray-950/10' : 'border-gray-200'} ${canInteract ? 'hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-26px_rgba(15,23,42,0.45)]' : 'cursor-default'}`}
                style={{
                  top: canvasEntry.top,
                  left,
                  width: TIMELINE_CARD_WIDTH,
                  height: canvasEntry.height,
                }}
              >
                <div className={`absolute inset-x-0 top-0 h-1.5 ${config.accent}`} />
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{canvasEntry.eyebrow || config.label}</p>
                      <p className="mt-1 truncate text-sm font-semibold leading-5 text-gray-950 sm:text-base sm:leading-6">{canvasEntry.title}</p>
                    </div>
                    {canvasEntry.badgeCount ? (
                      <span className="mt-1 inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        {canvasEntry.badgeCount}
                      </span>
                    ) : canInteract ? <Pencil className="mt-1 h-4 w-4 text-gray-400" /> : null}
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-gray-600">{formatEntryRange(canvasEntry)}</p>
                  {detail ? <p className="mt-2 truncate text-sm font-semibold text-gray-800">{detail}</p> : null}
                  {canvasEntry.description && canvasEntry.height >= 176 ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">{canvasEntry.description}</p> : null}
                  {canvasEntry.meta?.length && canvasEntry.height >= 196 ? (
                    <div className="mt-auto grid gap-1 pt-2 text-xs text-gray-500">
                      {canvasEntry.meta.slice(0, 2).map((item) => <span key={item} className="truncate">{item}</span>)}
                    </div>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
