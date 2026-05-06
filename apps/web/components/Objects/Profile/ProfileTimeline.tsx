'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { Briefcase, GraduationCap, Heart, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { updateProfile } from '@services/settings/profile'

export type TimelineCategory = 'work' | 'education' | 'life'

export type TimelineEntry = {
  id: string
  category: TimelineCategory
  title: string
  description?: string
  startDate: string
  endDate?: string
  isOngoing?: boolean
  employer?: string
  institution?: string
}

type TimelineModalState = {
  open: boolean
  mode: 'create' | 'edit'
  category: TimelineCategory
  entryId?: string
}

type LayoutEvent = TimelineEntry & {
  top: number
  height: number
  lane: number
  laneCount: number
  sortTop: number
}

type MonthMarker = {
  key: string
  year: number
  month: number
  top: number
}

type ProfileTimelineProps = {
  initialUser: any
  orgslug: string
  profileUsername?: string
  canEdit?: boolean
}

type ProfileTimelineSummaryProps = {
  timeline: TimelineEntry[]
  orgslug: string
  profileUsername?: string
  editMode?: boolean
  canEdit?: boolean
  enabled?: boolean
  // eslint-disable-next-line no-unused-vars
  onEnabledChange?: (enabled: boolean) => void
}

type TimelineEntryModalProps = {
  open: boolean
  entry: TimelineEntry
  category: TimelineCategory
  saving: boolean
  // eslint-disable-next-line no-unused-vars
  onOpenChange: (...args: [boolean]) => void
  // eslint-disable-next-line no-unused-vars
  onChange: (...args: [TimelineEntry]) => void
  onSave: () => void
  onDelete: (() => void) | null
}

const CATEGORY_CONFIG: Record<TimelineCategory, {
  label: string
  singular: string
  accent: string
  softAccent: string
  text: string
  icon: React.ComponentType<{ className?: string }>
  detailLabel: string
}> = {
  work: {
    label: 'Work',
    singular: 'work entry',
    accent: 'bg-sky-500',
    softAccent: 'bg-sky-50',
    text: 'text-sky-700',
    icon: Briefcase,
    detailLabel: 'Employer',
  },
  education: {
    label: 'Education',
    singular: 'education entry',
    accent: 'bg-emerald-500',
    softAccent: 'bg-emerald-50',
    text: 'text-emerald-700',
    icon: GraduationCap,
    detailLabel: 'Institution',
  },
  life: {
    label: 'Life',
    singular: 'life entry',
    accent: 'bg-rose-500',
    softAccent: 'bg-rose-50',
    text: 'text-rose-700',
    icon: Heart,
    detailLabel: '',
  },
}

const COLUMN_ORDER: TimelineCategory[] = ['work', 'education', 'life']
const TIMELINE_CARD_WIDTH = 220
const TIMELINE_LANE_GAP = 12
const TIMELINE_COLUMN_PADDING = 24
const TIMELINE_DEFAULT_MONTH_HEIGHT = 16
const TIMELINE_ENDPOINT_MONTH_HEIGHT = 28
const MIN_TIMELINE_CARD_HEIGHT = 136
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })
const MONTH_ONLY_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short' })

function createEmptyEntry(category: TimelineCategory): TimelineEntry {
  return {
    id: `timeline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    category,
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    isOngoing: false,
    employer: '',
    institution: '',
  }
}

function parseProfileValue(profile: any) {
  if (!profile) return {}
  if (typeof profile === 'string') {
    try {
      return JSON.parse(profile)
    } catch {
      return {}
    }
  }
  return profile
}

export function normalizeTimeline(timeline: any): TimelineEntry[] {
  if (!Array.isArray(timeline)) return []

  return timeline
    .map((entry: any) => ({
      id: entry.id || `timeline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      category: entry.category === 'education' || entry.category === 'life' ? entry.category : 'work',
      title: entry.title || '',
      description: entry.description || '',
      startDate: typeof entry.startDate === 'string' ? entry.startDate : '',
      endDate: typeof entry.endDate === 'string' ? entry.endDate : '',
      isOngoing: Boolean(entry.isOngoing),
      employer: entry.employer || '',
      institution: entry.institution || '',
    }))
    .filter((entry: TimelineEntry) => entry.startDate)
}

function getTimelineProfile(profile: any): TimelineEntry[] {
  return normalizeTimeline(parseProfileValue(profile).timeline)
}

function getEffectiveEndDate(entry: TimelineEntry) {
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

function formatEntryRange(entry: TimelineEntry) {
  const start = formatMonth(entry.startDate)
  const end = entry.isOngoing ? 'Present' : formatMonth(entry.endDate)
  if (!start) return end
  if (!end) return start
  return `${start} - ${end}`
}

function sortTimelineEntries(entries: TimelineEntry[]) {
  return [...entries].sort((a, b) => {
    const endDiff = monthKey(getEffectiveEndDate(b)) - monthKey(getEffectiveEndDate(a))
    if (endDiff !== 0) return endDiff
    return monthKey(b.startDate) - monthKey(a.startDate)
  })
}

function summarizeTimeline(entries: TimelineEntry[]) {
  const sorted = sortTimelineEntries(entries)
  const active = sorted.filter((entry) => entry.isOngoing)
  return active.length > 0 ? active.slice(0, 3) : sorted.slice(0, 3)
}

function buildTimelineRows(entries: TimelineEntry[]) {
  if (entries.length === 0) {
    const currentYear = new Date().getFullYear()
    return {
      rows: [{ kind: 'year', year: currentYear, height: 220 }] as any[],
      minYear: currentYear,
      maxYear: currentYear,
    }
  }

  const years = entries.flatMap((entry) => {
    const start = getMonthIndex(entry.startDate)
    const end = getMonthIndex(getEffectiveEndDate(entry))
    if (!start || !end) return []
    return [start.year, end.year]
  })
  const eventYears = new Set(years)
  const endpointMonthsByYear = new Map<number, Set<number>>()
  const addEndpointMonth = (year: number, month: number) => {
    const existing = endpointMonthsByYear.get(year) ?? new Set<number>()
    existing.add(month)
    endpointMonthsByYear.set(year, existing)
  }

  entries.forEach((entry) => {
    const start = getMonthIndex(entry.startDate)
    const end = getMonthIndex(getEffectiveEndDate(entry))
    if (start) addEndpointMonth(start.year, start.month)
    if (end && !entry.isOngoing) addEndpointMonth(end.year, end.month)
  })

  const maxYear = Math.max(new Date().getFullYear(), ...years)
  const minYear = Math.min(...years)
  const rows: any[] = []
  let year = maxYear

  while (year >= minYear) {
    const matching = entries.filter((entry) => {
      const start = getMonthIndex(entry.startDate)
      const end = getMonthIndex(getEffectiveEndDate(entry))
      if (!start || !end) return false
      return start.year === year || end.year === year
    })

    if (eventYears.has(year)) {
      const monthHeights = Array(13).fill(TIMELINE_DEFAULT_MONTH_HEIGHT)
      endpointMonthsByYear.get(year)?.forEach((month) => {
        monthHeights[month] = Math.max(monthHeights[month], TIMELINE_ENDPOINT_MONTH_HEIGHT)
      })

      matching.forEach((entry) => {
        const start = getMonthIndex(entry.startDate)
        const end = getMonthIndex(getEffectiveEndDate(entry))
        if (!start || !end || entry.isOngoing || start.year !== year || end.year !== year) return
        const monthSpan = Math.max(1, end.month - start.month + 1)
        const requiredMonthHeight = MIN_TIMELINE_CARD_HEIGHT / monthSpan
        for (let month = start.month; month <= end.month; month += 1) {
          monthHeights[month] = Math.max(monthHeights[month], requiredMonthHeight)
        }
      })

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

function buildLayout(entries: TimelineEntry[]) {
  const validEntries = entries.filter((entry) => getMonthIndex(entry.startDate) && getMonthIndex(getEffectiveEndDate(entry)))
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
  const byColumn = {} as Record<TimelineCategory, LayoutEvent[]>
  const columnWidths = {} as Record<TimelineCategory, number>
  const monthMarkersByKey = new Map<string, MonthMarker>()

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

  COLUMN_ORDER.forEach((category) => {
    const columnEntries = sortTimelineEntries(validEntries.filter((entry) => entry.category === category))

    const provisional = columnEntries.map((entry) => {
      const start = getMonthIndex(entry.startDate)!
      const end = getMonthIndex(getEffectiveEndDate(entry))!
      const startRow = yearMap.get(start.year)!
      const endRow = yearMap.get(end.year)!
      const rawTop = entry.isOngoing ? 0 : getMonthTop(endRow, end.month)
      const bottom = getMonthBottom(startRow, start.month)
      const top = Math.max(0, rawTop)
      const height = Math.min(
        Math.max(MIN_TIMELINE_CARD_HEIGHT, bottom - top),
        Math.max(MIN_TIMELINE_CARD_HEIGHT, totalHeight - top - 16)
      )
      return {
        ...entry,
        sortTop: top,
        top,
        height,
        lane: 0,
        laneCount: 1,
      }
    })

    const lanes: number[] = []
    provisional.forEach((entry) => {
      let laneIndex = 0
      while (laneIndex < lanes.length && lanes[laneIndex] > entry.top + 12) {
        laneIndex += 1
      }
      lanes[laneIndex] = entry.top + entry.height
      entry.lane = laneIndex
    })

    const laneCount = Math.max(1, lanes.length)
    byColumn[category] = provisional.map((entry) => ({
      ...entry,
      laneCount,
    }))
    columnWidths[category] = TIMELINE_COLUMN_PADDING + (laneCount * TIMELINE_CARD_WIDTH) + ((laneCount - 1) * TIMELINE_LANE_GAP)
  })

  return {
    rows: rowOffsets,
    monthMarkers: [...monthMarkersByKey.values()].sort((a, b) => a.top - b.top),
    totalHeight,
    byColumn,
    columnWidths,
  }
}

function getTimelineHref(orgslug: string, profileUsername?: string) {
  return profileUsername
    ? getUriWithOrg(orgslug, routePaths.org.userTimeline(profileUsername))
    : getUriWithOrg(orgslug, routePaths.org.profileTimeline())
}

function TimelineSummaryCard({ entry }: { entry: TimelineEntry }) {
  const config = CATEGORY_CONFIG[entry.category]
  const Icon = config.icon
  const detail = entry.category === 'work' ? entry.employer : entry.category === 'education' ? entry.institution : ''

  return (
    <div className={`rounded-2xl border border-gray-200 ${config.softAccent} p-4`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
        <Icon className={`h-4 w-4 ${config.text}`} />
        {config.label}
      </div>
      <p className="mt-3 text-base font-semibold text-gray-950">{entry.title}</p>
      <p className="mt-1 text-sm text-gray-600">{formatEntryRange(entry)}</p>
      {detail ? <p className="mt-2 text-sm font-medium text-gray-700">{detail}</p> : null}
      {entry.description ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">{entry.description}</p> : null}
    </div>
  )
}

export function ProfileTimelineSummary({
  timeline,
  orgslug,
  profileUsername,
  editMode = false,
  canEdit = false,
  enabled = false,
  onEnabledChange,
}: ProfileTimelineSummaryProps) {
  const summaryEntries = summarizeTimeline(timeline)
  const href = getTimelineHref(orgslug, profileUsername)

  if (!editMode && !enabled) return null
  if (!editMode && enabled && summaryEntries.length === 0) return null

  return (
    <section className="mt-6 px-4 sm:px-0">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-gray-950">Timeline</h2>
          {editMode && canEdit ? (
            <Button asChild variant="outline" size="sm">
              <Link href={href}>Edit</Link>
            </Button>
          ) : null}
        </div>
        {editMode && canEdit ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{enabled ? 'Visible on profile' : 'Hidden from profile'}</span>
            <Switch checked={enabled} onCheckedChange={onEnabledChange} />
          </div>
        ) : (
          <Button variant="ghost" className="px-0 text-sm font-medium text-gray-500 hover:bg-transparent hover:text-gray-950" asChild>
            <Link href={href}>See full timeline</Link>
          </Button>
        )}
      </div>

      {enabled ? (
        summaryEntries.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            {summaryEntries.map((entry) => (
              <TimelineSummaryCard key={entry.id} entry={entry} />
            ))}
          </div>
        ) : editMode ? (
          <div className="rounded-[20px] border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
            <p className="text-base font-semibold text-gray-800">No timeline entries yet</p>
            <p className="mt-2 text-sm text-gray-500">Add work, education, and life chapters from the timeline editor.</p>
          </div>
        ) : null
      ) : null}
    </section>
  )
}

function TimelineEntryModal({
  open,
  entry,
  category,
  saving,
  onOpenChange,
  onChange,
  onSave,
  onDelete,
}: TimelineEntryModalProps) {
  const config = CATEGORY_CONFIG[category]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden rounded-[24px] border-0 p-0">
        <DialogHeader className="border-b border-gray-100 px-6 py-5">
          <DialogTitle>{onDelete ? `Edit ${config.singular}` : `Add ${config.singular}`}</DialogTitle>
          <DialogDescription>
            Capture a chapter of your story with dates, a title, and a little context.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700" htmlFor="timeline-title">Title</label>
            <Input
              id="timeline-title"
              value={entry.title}
              onChange={(event) => onChange({ ...entry, title: event.target.value })}
              placeholder={category === 'work' ? 'Senior Product Designer' : category === 'education' ? 'B.S. Computer Science' : 'Moved to Seattle'}
            />
          </div>

          {category === 'work' ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="timeline-employer">Employer</label>
              <Input
                id="timeline-employer"
                value={entry.employer || ''}
                onChange={(event) => onChange({ ...entry, employer: event.target.value })}
                placeholder="Company or organization"
              />
            </div>
          ) : null}

          {category === 'education' ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="timeline-institution">Institution</label>
              <Input
                id="timeline-institution"
                value={entry.institution || ''}
                onChange={(event) => onChange({ ...entry, institution: event.target.value })}
                placeholder="School, program, or institution"
              />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="timeline-start">Start date</label>
              <Input
                id="timeline-start"
                type="month"
                value={entry.startDate}
                onChange={(event) => onChange({ ...entry, startDate: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="timeline-end">End date</label>
              <Input
                id="timeline-end"
                type="month"
                value={entry.endDate || ''}
                onChange={(event) => onChange({ ...entry, endDate: event.target.value })}
                disabled={entry.isOngoing}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Still going</p>
              <p className="text-xs text-gray-500">Use this for current work, study, or life chapters.</p>
            </div>
            <Switch
              checked={Boolean(entry.isOngoing)}
              onCheckedChange={(checked) => onChange({ ...entry, isOngoing: checked, endDate: checked ? '' : entry.endDate })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700" htmlFor="timeline-description">Description</label>
            <Textarea
              id="timeline-description"
              value={entry.description || ''}
              onChange={(event) => onChange({ ...entry, description: event.target.value })}
              className="min-h-28"
              placeholder="What were you doing during this period?"
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-gray-100 bg-white px-6 py-4">
          {onDelete ? (
            <Button type="button" variant="ghost" onClick={onDelete} className="mr-auto text-red-600 hover:text-red-700">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          ) : <div />}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ProfileTimeline({
  initialUser,
  orgslug,
  profileUsername,
  canEdit = false,
}: ProfileTimelineProps) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [user, setUser] = useState(initialUser)
  const [timeline, setTimeline] = useState<TimelineEntry[]>(() => getTimelineProfile(initialUser.profile))
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState<TimelineModalState>({ open: false, mode: 'create', category: 'work' })
  const [draftEntry, setDraftEntry] = useState<TimelineEntry>(createEmptyEntry('work'))

  const layout = useMemo(() => buildLayout(timeline), [timeline])
  const timelineGridTemplate = useMemo(
    () => `64px ${COLUMN_ORDER.map((category) => `${layout.columnWidths[category]}px`).join(' ')}`,
    [layout]
  )
  const profileHref = profileUsername
    ? getUriWithOrg(orgslug, routePaths.org.user(profileUsername))
    : getUriWithOrg(orgslug, routePaths.org.profile())

  const persistTimeline = async (nextTimeline: TimelineEntry[], successMessage: string) => {
    if (!accessToken) {
      toast.error('Sign in to save your timeline')
      return
    }

    setSaving(true)
    const loadingToast = toast.loading('Saving timeline')
    try {
      const currentProfile = parseProfileValue(user.profile)
      const payload = {
        ...user,
        profile: {
          ...currentProfile,
          timeline: nextTimeline,
        },
      }

      const res = await updateProfile(payload, user.id, accessToken)
      if (!res.success) throw new Error(res.HTTPmessage)
      setUser(res.data)
      setTimeline(getTimelineProfile(res.data.profile))
      toast.success(successMessage, { id: loadingToast })
      setModal((current) => ({ ...current, open: false }))
    } catch {
      toast.error('Could not save timeline', { id: loadingToast })
    } finally {
      setSaving(false)
    }
  }

  const openCreateModal = (category: TimelineCategory) => {
    setDraftEntry(createEmptyEntry(category))
    setModal({ open: true, mode: 'create', category })
  }

  const openEditModal = (entry: TimelineEntry) => {
    setDraftEntry({ ...entry })
    setModal({ open: true, mode: 'edit', category: entry.category, entryId: entry.id })
  }

  const handleSaveEntry = async () => {
    if (!draftEntry.title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!draftEntry.startDate) {
      toast.error('Start date is required')
      return
    }
    if (!draftEntry.isOngoing && !draftEntry.endDate) {
      toast.error('End date is required unless the entry is ongoing')
      return
    }
    if (!draftEntry.isOngoing && monthKey(draftEntry.startDate) > monthKey(draftEntry.endDate || '')) {
      toast.error('Start date must be earlier than or the same as end date')
      return
    }

    const nextTimeline = modal.mode === 'edit'
      ? timeline.map((entry) => (entry.id === draftEntry.id ? draftEntry : entry))
      : [...timeline, draftEntry]

    await persistTimeline(nextTimeline, modal.mode === 'edit' ? 'Timeline entry updated' : 'Timeline entry added')
  }

  const handleDeleteEntry = async () => {
    if (modal.mode !== 'edit') return
    await persistTimeline(
      timeline.filter((entry) => entry.id !== draftEntry.id),
      'Timeline entry deleted'
    )
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Link href={profileHref} className="text-sm font-medium text-gray-500 hover:text-gray-800">
                Back to profile
              </Link>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">Timeline</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
                Map out the arcs of your work, education, and life. Each column can grow independently, and quiet stretches are compressed so the story stays readable.
              </p>
            </div>
          </div>

          <div className="mt-8 overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="grid gap-3" style={{ gridTemplateColumns: timelineGridTemplate }}>
                <div />
                {COLUMN_ORDER.map((category) => {
                  const config = CATEGORY_CONFIG[category]
                  const Icon = config.icon
                  return (
                    <div key={category} className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border border-gray-200 ${config.softAccent} px-4 py-2.5`}>
                      <div className="flex min-w-0 items-center gap-2">
                        <Icon className={`h-4 w-4 ${config.text}`} />
                        <span className="truncate text-sm font-semibold text-gray-900">{config.label}</span>
                      </div>
                      {canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 rounded-full bg-white/70 text-gray-600 hover:bg-white hover:text-gray-950"
                          onClick={() => openCreateModal(category)}
                          aria-label={`Add ${CATEGORY_CONFIG[category].singular}`}
                          title={`Add ${CATEGORY_CONFIG[category].singular}`}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              <div className="relative mt-3 grid gap-3" style={{ gridTemplateColumns: timelineGridTemplate }}>
                <div className="relative" style={{ height: layout.totalHeight }}>
                  {layout.rows.map((row) => (
                    row.kind === 'year' ? (
                      <div key={`year-${row.year}`} className="absolute left-0 right-0" style={{ top: row.top, height: row.height }}>
                        <div className="absolute right-0 flex h-5 -translate-y-1/2 items-center pr-2 text-right text-sm font-semibold text-gray-500" style={{ top: 0 }}>
                          {row.year}
                        </div>
                      </div>
                    ) : (
                      <div key={`gap-${row.startYear}-${row.endYear}`} className="absolute left-0 right-0" style={{ top: row.top, height: row.height }}>
                        <div className="absolute right-0 flex h-5 -translate-y-1/2 items-center pr-2 text-right text-sm font-semibold text-gray-500" style={{ top: 0 }}>
                          {row.startYear}
                        </div>
                        <div className="flex h-full items-center justify-end pr-2 text-sm tracking-[0.45em] text-gray-300">
                          ...
                        </div>
                      </div>
                    )
                  ))}
                  {layout.monthMarkers.map((marker) => (
                    <div
                      key={`month-${marker.key}`}
                      className="absolute left-0 right-0 pr-2 text-right text-xs font-medium text-gray-400"
                      style={{ top: marker.top - 8 }}
                    >
                      {formatMonthLabel(marker.month)}
                    </div>
                  ))}
                </div>

                {COLUMN_ORDER.map((category) => {
                  const config = CATEGORY_CONFIG[category]
                  const events = [...layout.byColumn[category]].sort((a, b) => a.sortTop - b.sortTop)

                  const gapButtons = canEdit
                    ? events.length === 0
                      ? [{ key: `${category}-empty`, top: Math.max(84, layout.totalHeight / 2 - 16) }]
                      : events.slice(0, -1).flatMap((event, index) => {
                        const next = events[index + 1]
                        const availableGap = next.top - (event.top + event.height)
                        if (availableGap < 56) return []
                        return {
                          key: `${category}-mid-${event.id}-${next.id}`,
                          top: event.top + event.height + (availableGap / 2) - 16,
                        }
                      })
                    : []

                  return (
                    <div key={category} className={`relative overflow-hidden rounded-2xl border border-gray-200 ${config.softAccent}`} style={{ height: layout.totalHeight }}>
                      {layout.rows.map((row) => (
                        <div
                          key={`${category}-${row.kind === 'year' ? row.year : `${row.startYear}-${row.endYear}`}`}
                          className="absolute left-0 right-0 border-b border-gray-100/80"
                          style={{ top: row.top, height: row.height }}
                        >
                          <div className={`absolute inset-y-0 left-0 w-full ${config.accent} ${row.kind === 'year' ? 'opacity-[0.08]' : 'opacity-[0.06]'}`} />
                          <div className="absolute left-0 top-0 h-px w-full bg-current text-gray-300" />
                          {row.kind === 'gap' ? (
                            <div className="absolute left-0 top-1/2 w-full -translate-y-1/2 text-center text-xs tracking-[0.4em] text-gray-300">...</div>
                          ) : null}
                        </div>
                      ))}

                      {gapButtons.map((button) => (
                        <button
                          key={button.key}
                          type="button"
                          onClick={() => openCreateModal(category)}
                          className="absolute left-1/2 z-20 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-dashed border-gray-300 bg-white text-gray-500 shadow-sm transition hover:border-gray-500 hover:text-gray-900"
                          style={{ top: button.top }}
                          aria-label={`Add ${CATEGORY_CONFIG[category].singular}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      ))}

                      {events.map((entry) => {
                        const left = 12 + (entry.lane * (TIMELINE_CARD_WIDTH + TIMELINE_LANE_GAP))
                        const detail = entry.category === 'work' ? entry.employer : entry.category === 'education' ? entry.institution : ''

                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={canEdit ? () => openEditModal(entry) : undefined}
                            tabIndex={canEdit ? 0 : -1}
                            aria-label={canEdit ? `Edit ${entry.title}` : undefined}
                            className={`absolute z-10 overflow-hidden rounded-xl border border-gray-200 bg-white p-3 text-left shadow-[0_18px_45px_-28px_rgba(15,23,42,0.45)] transition ${canEdit ? 'hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-26px_rgba(15,23,42,0.45)]' : 'cursor-default'}`}
                            style={{
                              top: entry.top,
                              left,
                              width: TIMELINE_CARD_WIDTH,
                              height: entry.height,
                            }}
                          >
                            <div className={`absolute inset-x-0 top-0 h-1.5 ${config.accent}`} />
                            <div className="flex h-full flex-col">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{config.label}</p>
                                  <p className="mt-1 truncate text-sm font-semibold leading-5 text-gray-950 sm:text-base sm:leading-6">{entry.title}</p>
                                </div>
                                {canEdit ? <Pencil className="mt-1 h-4 w-4 text-gray-400" /> : null}
                              </div>
                              <p className="mt-2 truncate text-sm font-medium text-gray-600">{formatEntryRange(entry)}</p>
                              {detail ? <p className="mt-2 truncate text-sm font-semibold text-gray-800">{detail}</p> : null}
                              {entry.description && entry.height >= 176 ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">{entry.description}</p> : null}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
      </div>

      <TimelineEntryModal
        open={modal.open}
        entry={draftEntry}
        category={modal.category}
        saving={saving}
        onOpenChange={(open) => setModal((current) => ({ ...current, open }))}
        onChange={setDraftEntry}
        onSave={handleSaveEntry}
        onDelete={modal.mode === 'edit' ? handleDeleteEntry : null}
      />
    </main>
  )
}
