'use client'

import React, { MouseEvent, PointerEvent, useMemo, useRef, useState } from 'react'
import { Briefcase, GraduationCap, Heart, Move, Pencil, ZoomIn, ZoomOut } from 'lucide-react'

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
  variant?: 'default' | 'roadmap'
  onEntryClick?: (entry: TimelineCanvasEntry) => void
  onEntryMove?: (entry: TimelineCanvasEntry, placement: { startDate: string; endDate: string; isOngoing: boolean }) => void | Promise<void>
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
const ROADMAP_COLUMN_MARGIN = 32
const ROADMAP_BOTTOM_MARGIN = 44
const ROADMAP_FUTURE_YEAR_BUFFER = 4
const ROADMAP_MIN_VERTICAL_SCALE = 0.55
const ROADMAP_MAX_VERTICAL_SCALE = 1.8
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

function monthKeyFromParts(value: { year: number; month: number }) {
  return value.year * 12 + (value.month - 1)
}

function monthKeyToParts(key: number) {
  return {
    year: Math.floor(key / 12),
    month: (key % 12) + 1,
  }
}

function formatDateParts(value: { year: number; month: number }) {
  return `${value.year}-${String(value.month).padStart(2, '0')}`
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

function getDateTop(row: { top: number; height: number; monthHeights?: number[] }, date: Date) {
  const month = date.getMonth() + 1
  const top = getMonthTop(row, month)
  const bottom = getMonthBottom(row, month)
  const daysInMonth = new Date(date.getFullYear(), month, 0).getDate()
  const progress = Math.max(0, Math.min(1, (date.getDate() - 1) / Math.max(1, daysInMonth - 1)))
  return top + ((bottom - top) * progress)
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

function buildTimelineRows(entries: TimelineCanvasEntry[], variant: TimelineCanvasProps['variant'] = 'default', verticalScale = 1) {
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
    const monthHeights = Array(13).fill(TIMELINE_DEFAULT_MONTH_HEIGHT * verticalScale)
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

  const currentYear = new Date().getFullYear()
  const maxYear = Math.max(currentYear, ...years) + (variant === 'roadmap' ? ROADMAP_FUTURE_YEAR_BUFFER : 0)
  const minYear = variant === 'roadmap' ? currentYear : Math.min(...years)
  const rows: any[] = []

  if (variant === 'roadmap') {
    for (let roadmapYear = maxYear; roadmapYear >= minYear; roadmapYear -= 1) {
      const monthHeights = getMonthHeights(roadmapYear)
      rows.push({
        kind: 'year',
        year: roadmapYear,
        height: monthHeights.slice(1).reduce((sum, monthHeight) => sum + monthHeight, 0),
        monthHeights,
      })
    }
    return { rows, minYear, maxYear }
  }

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

function buildLayout(entries: TimelineCanvasEntry[], variant: TimelineCanvasProps['variant'] = 'default', verticalScale = 1) {
  const today = new Date()
  const currentMonth = { year: today.getFullYear(), month: today.getMonth() + 1 }
  const currentMonthKey = currentMonth.year * 12 + (currentMonth.month - 1)
  const validEntries = entries.filter((entry) => {
    const start = getMonthIndex(entry.startDate)
    const end = getMonthIndex(getEffectiveEndDate(entry))
    if (!start || !end || monthKey(entry.startDate) > monthKey(getEffectiveEndDate(entry))) return false
    if (variant === 'roadmap' && monthKeyFromParts(end) < currentMonthKey) return false
    return true
  })
  const { rows } = buildTimelineRows(validEntries, variant, verticalScale)

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

  const currentYearRow = yearMap.get(currentMonth.year)
  const currentDateTop = currentYearRow ? getDateTop(currentYearRow, today) : null
  const baseHeight = validEntries.length === 0 ? 320 : 520
  const totalHeight = variant === 'roadmap'
    ? Math.max(offset + ROADMAP_BOTTOM_MARGIN, baseHeight)
    : Math.max(offset + 16, baseHeight)
  const monthMarkersByKey = new Map<string, MonthMarker>()
  const events = sortTimelineEntries(validEntries).map((entry) => {
    const start = getMonthIndex(entry.startDate)!
    const end = getMonthIndex(getEffectiveEndDate(entry))!
    const visibleStart = variant === 'roadmap' && monthKeyFromParts(start) < currentMonthKey ? currentMonth : start
    const startRow = yearMap.get(start.year)!
    const visibleStartRow = yearMap.get(visibleStart.year)!
    const endRow = yearMap.get(end.year)!
    const rawTop = entry.isOngoing && variant !== 'roadmap' ? 0 : getMonthTop(endRow, end.month)
    const bottom = getMonthBottom(visibleStartRow || startRow, visibleStart.month)
    const top = Math.max(0, rawTop)
    const maxBottom = totalHeight - 16
    const height = Math.min(Math.max(0, bottom - top), Math.max(0, maxBottom - top))
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
  const edgeMargin = variant === 'roadmap' ? ROADMAP_COLUMN_MARGIN : TIMELINE_COLUMN_PADDING
  const columnWidth = (edgeMargin * 2) + (laneCount * TIMELINE_CARD_WIDTH) + ((laneCount - 1) * TIMELINE_LANE_GAP)

  return {
    rows: rowOffsets,
    yearMap,
    monthMarkers: [...monthMarkersByKey.values()].sort((a, b) => a.top - b.top),
    totalHeight,
    events: events.map((entry) => ({
      ...entry,
      laneCount,
    })),
    columnWidth,
    edgeMargin,
    currentDateTop,
  }
}

function getMonthAtTop(layout: ReturnType<typeof buildLayout>, top: number) {
  const yearRows = layout.rows.filter((row) => row.kind === 'year')
  for (const row of yearRows) {
    if (top < row.top - 1 || top > row.top + row.height + 1) continue
    for (let month = 12; month >= 1; month -= 1) {
      const yearRow = layout.yearMap.get(row.year)
      if (!yearRow) continue
      const monthTop = getMonthTop(yearRow, month)
      const monthBottom = getMonthBottom(yearRow, month)
      if (top >= monthTop && top <= monthBottom) return { year: row.year, month }
    }
  }

  const first = yearRows[0]
  const last = yearRows[yearRows.length - 1]
  if (first && top < first.top) return { year: first.year, month: 12 }
  if (last) return { year: last.year, month: 1 }
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

function clampMonthKey(key: number, minKey: number, maxKey: number) {
  return Math.max(minKey, Math.min(maxKey, key))
}

export function TimelineCanvas({
  entries,
  selectedId,
  canInteract = true,
  emptyMessage = 'No timeline entries yet',
  variant = 'default',
  onEntryClick,
  onEntryMove,
}: TimelineCanvasProps) {
  const dragRef = useRef<{
    id: number
    entryId: string
    startY: number
    top: number
    height: number
    durationMonths: number
    moved: boolean
  } | null>(null)
  const panRef = useRef<{
    id: number
    x: number
    y: number
    scrollLeft: number
    scrollTop: number
    moved: boolean
  } | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const suppressClickRef = useRef(false)
  const [verticalScale, setVerticalScale] = useState(1)
  const [dragPreview, setDragPreview] = useState<{
    entryId: string
    top: number
    start: { year: number; month: number }
    end: { year: number; month: number }
  } | null>(null)
  const layout = useMemo(() => buildLayout(entries, variant, verticalScale), [entries, variant, verticalScale])
  const timelineGridTemplate = useMemo(
    () => `${TIMELINE_LABEL_COLUMN_WIDTH}px minmax(0, 1fr)`,
    []
  )
  const isRoadmap = variant === 'roadmap'

  const zoomBy = (delta: number) => {
    if (!isRoadmap) return
    setVerticalScale((current) => Math.min(ROADMAP_MAX_VERTICAL_SCALE, Math.max(ROADMAP_MIN_VERTICAL_SCALE, Number((current + delta).toFixed(2)))))
  }

  const handleRoadmapWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    setVerticalScale((current) => Math.min(
      ROADMAP_MAX_VERTICAL_SCALE,
      Math.max(ROADMAP_MIN_VERTICAL_SCALE, Number((current - event.deltaY * 0.001).toFixed(2)))
    ))
  }

  const getDragDates = (top: number, height: number, durationMonths: number) => {
    const upperMonthKey = monthKeyFromParts(getMonthAtTop(layout, 0))
    const lowerMonthKey = monthKeyFromParts(getMonthAtTop(layout, layout.totalHeight))
    const minStartKey = Math.min(lowerMonthKey, upperMonthKey)
    const maxStartKey = Math.max(minStartKey, Math.max(lowerMonthKey, upperMonthKey) - durationMonths)
    const start = getMonthAtTop(layout, top + height)
    const startKey = clampMonthKey(monthKeyFromParts(start), minStartKey, maxStartKey)
    const endKey = startKey + durationMonths
    return {
      start: monthKeyToParts(startKey),
      end: monthKeyToParts(endKey),
    }
  }

  const handleEntryPointerDown = (event: PointerEvent<HTMLButtonElement>, entry: TimelineCanvasEntry & { top: number; height: number }) => {
    if (!isRoadmap || !canInteract || event.button !== 0) {
      event.stopPropagation()
      return
    }
    const start = getMonthIndex(entry.startDate)
    const end = getMonthIndex(getEffectiveEndDate(entry))
    if (!start || !end) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    suppressClickRef.current = false
    dragRef.current = {
      id: event.pointerId,
      entryId: entry.id,
      startY: event.clientY,
      top: entry.top,
      height: entry.height,
      durationMonths: Math.max(0, monthKeyFromParts(end) - monthKeyFromParts(start)),
      moved: false,
    }
  }

  const handleEntryPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    const dy = event.clientY - drag.startY
    const moved = drag.moved || Math.abs(dy) > 2
    if (!moved) return
    if (moved) {
      event.preventDefault()
      suppressClickRef.current = true
    }
    const minTop = 0
    const maxTop = Math.max(0, layout.totalHeight - ROADMAP_BOTTOM_MARGIN - drag.height)
    const top = Math.min(maxTop, Math.max(minTop, drag.top + dy))
    const dates = getDragDates(top, drag.height, drag.durationMonths)
    dragRef.current = { ...drag, moved }
    setDragPreview({ entryId: drag.entryId, top, ...dates })
  }

  const handleEntryPointerUp = (event: PointerEvent<HTMLButtonElement>, entry: TimelineCanvasEntry) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!drag.moved || !dragPreview || dragPreview.entryId !== entry.id) {
      setDragPreview(null)
      if (!drag.moved && canInteract) onEntryClick?.(entry)
      return
    }
    void onEntryMove?.(entry, {
      startDate: formatDateParts(dragPreview.start),
      endDate: formatDateParts(dragPreview.end),
      isOngoing: false,
    })
    setDragPreview(null)
  }

  const handleEntryPointerCancel = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.id !== event.pointerId) return
    dragRef.current = null
    setDragPreview(null)
  }

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = false
  }

  const handlePanPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!isRoadmap || event.button !== 0 || !scrollerRef.current) return
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.closest('button, a, input, textarea, select, [data-timeline-control="true"]')) return
    panRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: scrollerRef.current.scrollLeft,
      scrollTop: scrollerRef.current.scrollTop,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePanPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    const scroller = scrollerRef.current
    if (!pan || !scroller || pan.id !== event.pointerId) return
    const dx = event.clientX - pan.x
    const dy = event.clientY - pan.y
    const moved = pan.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2
    if (!moved) return
    event.preventDefault()
    scroller.scrollLeft = pan.scrollLeft - dx
    scroller.scrollTop = pan.scrollTop - dy
    panRef.current = { ...pan, moved }
  }

  const handlePanPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.id === event.pointerId) panRef.current = null
  }

  if (!entries.length) {
    return (
      <div className={isRoadmap ? 'flex h-full min-h-[420px] items-center justify-center px-6 text-center' : 'rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-16 text-center'}>
        <p className="text-base font-semibold text-gray-800">{emptyMessage}</p>
      </div>
    )
  }

  const timelineBody = (
    <>
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
              <div className="flex h-full items-center justify-end pr-1 text-xs tracking-[0.25em] text-gray-300 sm:pr-2 sm:text-sm sm:tracking-[0.45em]">...</div>
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
        {isRoadmap && dragPreview ? (
          <div className="absolute left-0 right-0 z-20 pr-1 text-right sm:pr-2" style={{ top: dragPreview.top + (layout.events.find((entry) => entry.id === dragPreview.entryId)?.height ?? 0) - 11 }}>
            <span className="inline-flex rounded bg-gray-950 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {formatMonthLabel(dragPreview.start.month)} {dragPreview.start.year}
            </span>
          </div>
        ) : null}
      </div>

      <div onClickCapture={handleClickCapture} className={isRoadmap ? 'relative min-w-0' : 'min-w-0 overflow-x-auto pb-4'}>
        <div
          className={isRoadmap ? 'relative h-full min-w-full overflow-visible' : 'relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50'}
          style={{
            minWidth: isRoadmap ? layout.columnWidth : undefined,
            width: isRoadmap ? '100%' : layout.columnWidth,
            height: layout.totalHeight,
          }}
        >
          {layout.rows.map((row) => (
            <div
              key={`timeline-${row.kind === 'year' ? row.year : `${row.startYear}-${row.endYear}`}`}
              className={isRoadmap ? 'absolute left-0 right-0 border-b border-gray-200' : 'absolute left-0 right-0 border-b border-gray-100/80'}
              style={{ top: row.top, height: row.height }}
            >
              {isRoadmap ? null : <div className={`absolute inset-y-0 left-0 w-full bg-gray-900 ${row.kind === 'year' ? 'opacity-[0.025]' : 'opacity-[0.015]'}`} />}
              <div className="absolute left-0 top-0 h-px w-full bg-current text-gray-300" />
              {row.kind === 'gap' ? <div className="absolute left-0 top-1/2 w-full -translate-y-1/2 text-center text-xs tracking-[0.4em] text-gray-300">...</div> : null}
            </div>
          ))}
          {isRoadmap && layout.currentDateTop !== null ? (
            <div className="absolute left-0 right-0 z-[5] border-t border-gray-950/70" style={{ top: layout.currentDateTop }}>
              <span className="absolute left-0 top-1.5 rounded-sm bg-white pr-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-700">Today</span>
            </div>
          ) : null}
          {isRoadmap ? (
            <>
              <div className="absolute bottom-0 left-0 top-0 z-[4] border-l border-gray-300" />
              <div className="absolute bottom-0 right-0 top-0 z-[4] border-r border-gray-300" />
            </>
          ) : null}
          {isRoadmap && dragPreview ? (
            <div className="absolute left-0 right-0 z-20 border-t border-gray-950" style={{ top: dragPreview.top + (layout.events.find((entry) => entry.id === dragPreview.entryId)?.height ?? 0) }} />
          ) : null}

          {[...layout.events].sort((a, b) => a.sortTop - b.sortTop).map((entry) => {
            const canvasEntry = entry as TimelineCanvasEntry & typeof entry
            const config = CATEGORY_CONFIG[canvasEntry.category]
            const left = layout.edgeMargin + (canvasEntry.lane * (TIMELINE_CARD_WIDTH + TIMELINE_LANE_GAP))
            const detail = canvasEntry.detail ?? (canvasEntry.category === 'work' ? canvasEntry.employer : canvasEntry.category === 'education' ? canvasEntry.institution : '')
            const selected = selectedId === canvasEntry.id
            const previewing = dragPreview?.entryId === canvasEntry.id

            return (
              <button
                key={canvasEntry.id}
                type="button"
                onPointerDown={(event) => handleEntryPointerDown(event, canvasEntry)}
                onPointerMove={handleEntryPointerMove}
                onPointerUp={(event) => handleEntryPointerUp(event, canvasEntry)}
                onPointerCancel={handleEntryPointerCancel}
                onClick={canInteract ? (event) => {
                  if (isRoadmap) {
                    event.preventDefault()
                    return
                  }
                  onEntryClick?.(canvasEntry)
                } : undefined}
                tabIndex={canInteract ? 0 : -1}
                aria-label={canInteract ? `Open ${canvasEntry.title}` : undefined}
                className={`absolute z-10 overflow-hidden rounded-xl border bg-white p-3 text-left shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] transition ${selected ? 'border-gray-950 ring-2 ring-gray-950/10' : 'border-gray-200'} ${previewing ? 'opacity-90 ring-2 ring-gray-950/15' : ''} ${canInteract ? 'hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-26px_rgba(15,23,42,0.45)]' : 'cursor-default'}`}
                style={{
                  top: previewing ? dragPreview.top : canvasEntry.top,
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
                  <p className="mt-2 truncate text-sm font-medium text-gray-600">{previewing ? `${formatDateParts(dragPreview.start)} - ${formatDateParts(dragPreview.end)}` : formatEntryRange(canvasEntry)}</p>
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
    </>
  )

  if (isRoadmap) {
    return (
      <div className="relative h-full min-h-0 bg-white">
        <div data-timeline-control="true" className="absolute bottom-4 left-[72px] z-30 flex w-fit select-none items-center gap-1 rounded-lg border border-gray-200 bg-white/90 p-1 shadow-sm">
          <div className="rounded-md p-2 text-gray-500" aria-hidden="true">
            <Move className="h-4 w-4" />
          </div>
          <button type="button" onClick={() => zoomBy(-0.1)} className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900" aria-label="Compress timeline">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => zoomBy(0.1)} className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900" aria-label="Expand timeline">
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
        <div
          ref={scrollerRef}
          className="h-full min-h-0 cursor-grab overflow-auto active:cursor-grabbing"
          onWheel={handleRoadmapWheel}
          onPointerDown={handlePanPointerDown}
          onPointerMove={handlePanPointerMove}
          onPointerUp={handlePanPointerUp}
          onPointerCancel={handlePanPointerUp}
        >
          <div className="relative grid min-h-full gap-3" style={{ gridTemplateColumns: timelineGridTemplate, minWidth: layout.columnWidth + TIMELINE_LABEL_COLUMN_WIDTH + 12 }}>
            {timelineBody}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative grid gap-2 sm:gap-3" style={{ gridTemplateColumns: timelineGridTemplate }}>
      {timelineBody}
    </div>
  )
}
