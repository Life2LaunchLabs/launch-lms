'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { Briefcase, Flag, GraduationCap, Heart, Image as ImageIcon, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Button } from '@components/ui/button'
import { cardVariants } from '@components/ui/card'
import { Input } from '@components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
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
import ContentPageHeader from '@components/Objects/StyledElements/Headers/ContentPageHeader'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { updateProfile } from '@services/settings/portfolio'

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
  status?: string
  quote?: string
  quoteAuthor?: string
  mediaUrls?: string[]
}

type ProfileTimelineProps = {
  initialUser: any
  orgslug: string
  profileUsername?: string
  canEdit?: boolean
  embedded?: boolean
  editMode?: boolean
  enabled?: boolean
  publicVisible?: boolean
  // eslint-disable-next-line no-unused-vars
  onEnabledChange?: (enabled: boolean) => void
  // eslint-disable-next-line no-unused-vars
  onPublicVisibleChange?: (visible: boolean) => void
  // eslint-disable-next-line no-unused-vars
  onUserChange?: (user: any) => void
}

type TimelineDialogState = {
  open: boolean
  mode: 'create' | 'view'
}

type TimelineEntryDialogProps = {
  open: boolean
  entry: TimelineEntry
  canEdit: boolean
  saving: boolean
  mode: 'create' | 'view'
  // eslint-disable-next-line no-unused-vars
  onOpenChange: (open: boolean) => void
  // eslint-disable-next-line no-unused-vars
  onChange: (entry: TimelineEntry) => void
  onSave: () => void
  onDelete: (() => void) | null
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })
const CATEGORY_ORDER: TimelineCategory[] = ['work', 'life', 'education']

const CATEGORY_CONFIG: Record<TimelineCategory, {
  label: string
  detailLabel: string
  icon: React.ComponentType<{ className?: string }>
  accent: string
  dot: string
}> = {
  work: {
    label: 'Work',
    detailLabel: 'Employer',
    icon: Briefcase,
    accent: '#39bf00',
    dot: 'bg-[#39bf00]',
  },
  life: {
    label: 'Life',
    detailLabel: '',
    icon: Heart,
    accent: '#ef4444',
    dot: 'bg-red-500',
  },
  education: {
    label: 'Learning',
    detailLabel: 'Institution',
    icon: GraduationCap,
    accent: '#0ea5e9',
    dot: 'bg-sky-500',
  },
}

function createEmptyEntry(category: TimelineCategory = 'work'): TimelineEntry {
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
    status: '',
    quote: '',
    quoteAuthor: '',
    mediaUrls: [],
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

function normalizeMediaUrls(value: any): string[] {
  if (!Array.isArray(value)) return []
  return value.map((url) => String(url || '').trim()).filter(Boolean).slice(0, 4)
}

export function normalizeTimeline(timeline: any): TimelineEntry[] {
  if (!Array.isArray(timeline)) return []

  return timeline.map((entry: any) => {
    const category: TimelineCategory = entry.category === 'education' || entry.category === 'life' ? entry.category : 'work'

    return {
      id: entry.id || `timeline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      category,
      title: entry.title || '',
      description: entry.description || '',
      startDate: typeof entry.startDate === 'string' ? entry.startDate : '',
      endDate: typeof entry.endDate === 'string' ? entry.endDate : '',
      isOngoing: Boolean(entry.isOngoing),
      employer: entry.employer || '',
      institution: entry.institution || '',
      status: entry.status || '',
      quote: entry.quote || '',
      quoteAuthor: entry.quoteAuthor || '',
      mediaUrls: normalizeMediaUrls(entry.mediaUrls),
    }
  })
}

function getTimelineProfile(profile: any): TimelineEntry[] {
  return normalizeTimeline(parseProfileValue(profile).timeline)
}

function getMonthKey(value?: string) {
  const match = value ? /^(\d{4})-(\d{2})$/.exec(value) : null
  if (!match) return Number.NEGATIVE_INFINITY
  const month = Number(match[2])
  if (month < 1 || month > 12) return Number.NEGATIVE_INFINITY
  return Number(match[1]) * 12 + (month - 1)
}

function getEffectiveEndDate(entry: TimelineEntry) {
  if (entry.isOngoing) {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  }
  return entry.endDate || entry.startDate
}

function sortTimelineEntries(entries: TimelineEntry[]) {
  return [...entries].sort((a, b) => {
    const endDiff = getMonthKey(getEffectiveEndDate(b)) - getMonthKey(getEffectiveEndDate(a))
    if (endDiff !== 0) return endDiff
    return getMonthKey(b.startDate) - getMonthKey(a.startDate)
  })
}

function formatMonth(value?: string) {
  const match = value ? /^(\d{4})-(\d{2})$/.exec(value) : null
  if (!match) return ''
  return MONTH_FORMATTER.format(new Date(Number(match[1]), Number(match[2]) - 1, 1))
}

function formatEntryRange(entry: TimelineEntry) {
  const start = formatMonth(entry.startDate)
  const end = entry.isOngoing ? 'Current' : formatMonth(entry.endDate)
  if (start && end) return `${start} - ${end}`
  return end || start || 'No date yet'
}

function getEntryDetail(entry: TimelineEntry) {
  if (entry.category === 'work') return entry.employer
  if (entry.category === 'education') return entry.institution
  return ''
}

function getEntryAccent(entry: TimelineEntry) {
  return CATEGORY_CONFIG[entry.category].accent
}

function getMediaInputValue(entry: TimelineEntry) {
  return (entry.mediaUrls || []).join(', ')
}

function parseMediaInputValue(value: string) {
  return value.split(',').map((url) => url.trim()).filter(Boolean).slice(0, 4)
}

function TimelineCard({
  entry,
  canEdit,
  onOpen,
}: {
  entry: TimelineEntry
  canEdit: boolean
  onOpen: () => void
}) {
  const config = CATEGORY_CONFIG[entry.category]
  const accent = getEntryAccent(entry)
  const detail = getEntryDetail(entry)
  const visibleMedia = (entry.mediaUrls || []).slice(0, 3)

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cardVariants({ variant: 'interactive', size: 'sm', className: 'group w-full text-left focus:outline-none focus:ring-2 focus:ring-gray-900/20' })}
      style={{ borderColor: accent }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: accent }}>{config.label}</p>
          {detail ? <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{detail}</p> : null}
        </div>
        <p className="shrink-0 text-sm font-medium text-foreground">{formatEntryRange(entry)}</p>
      </div>

      <h3 className="mt-2 text-xl font-bold leading-6 text-foreground">{entry.title || 'Untitled timeline block'}</h3>

      {entry.description ? (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{entry.description}</p>
      ) : null}

      {visibleMedia.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {visibleMedia.slice(0, 2).map((url, index) => (
            <div key={`${url}-${index}`} className="relative aspect-[16/9] overflow-hidden rounded-md bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              {index === 1 && visibleMedia.length > 2 ? (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-950/45 text-lg font-bold text-white">
                  +{visibleMedia.length - 2}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {entry.quote ? (
        <blockquote className="mt-4 rounded-md border-l-4 bg-muted px-4 py-3 text-sm italic leading-6 text-muted-foreground" style={{ borderColor: accent }}>
          "{entry.quote}"
          {entry.quoteAuthor ? <footer className="mt-2 text-right text-sm font-bold not-italic text-foreground">- {entry.quoteAuthor}</footer> : null}
        </blockquote>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        {entry.status ? (
          <span className="inline-flex min-w-0 items-center rounded-full px-3 py-1 text-xs font-bold uppercase text-white" style={{ backgroundColor: accent }}>
            {entry.status}
          </span>
        ) : <span />}
        {canEdit ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground shadow-sm">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </span>
        ) : null}
      </div>
    </button>
  )
}

function ReadOnlyEntryDetail({ entry }: { entry: TimelineEntry }) {
  const accent = getEntryAccent(entry)
  const detail = getEntryDetail(entry)

  return (
    <div className="space-y-5 px-6 py-5">
      <div>
        <p className="text-sm font-bold" style={{ color: accent }}>{CATEGORY_CONFIG[entry.category].label}</p>
        <h3 className="mt-1 text-2xl font-bold text-foreground">{entry.title || 'Untitled timeline block'}</h3>
        <p className="mt-2 text-sm font-medium text-muted-foreground">{formatEntryRange(entry)}</p>
        {detail ? <p className="mt-2 text-sm font-semibold text-muted-foreground">{detail}</p> : null}
      </div>
      {entry.description ? <p className="text-sm leading-6 text-muted-foreground">{entry.description}</p> : null}
      {(entry.mediaUrls || []).length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(entry.mediaUrls || []).map((url, index) => (
            <div key={`${url}-${index}`} className="aspect-[16/9] overflow-hidden rounded-lg bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      ) : null}
      {entry.quote ? (
        <blockquote className="rounded-lg border-l-4 bg-muted px-4 py-3 text-base italic leading-7 text-muted-foreground" style={{ borderColor: accent }}>
          "{entry.quote}"
          {entry.quoteAuthor ? <footer className="mt-2 text-right text-sm font-bold not-italic text-foreground">- {entry.quoteAuthor}</footer> : null}
        </blockquote>
      ) : null}
    </div>
  )
}

function TimelineEntryDialog({
  open,
  entry,
  canEdit,
  saving,
  mode,
  onOpenChange,
  onChange,
  onSave,
  onDelete,
}: TimelineEntryDialogProps) {
  const config = CATEGORY_CONFIG[entry.category]
  const detailValue = entry.category === 'work' ? entry.employer || '' : entry.institution || ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden rounded-xl border-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle>{mode === 'create' ? 'Add timeline block' : canEdit ? 'Edit timeline block' : 'Timeline block'}</DialogTitle>
          <DialogDescription>
            {canEdit ? 'Set dates and details here. The card order updates automatically from the dates.' : formatEntryRange(entry)}
          </DialogDescription>
        </DialogHeader>

        {canEdit ? (
          <div className="space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="timeline-category">Category</label>
              <Select
                value={entry.category}
                onValueChange={(value) => onChange({ ...entry, category: value as TimelineCategory })}
              >
                <SelectTrigger id="timeline-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((categoryOption) => {
                    const optionConfig = CATEGORY_CONFIG[categoryOption]
                    const Icon = optionConfig.icon
                    return (
                      <SelectItem key={categoryOption} value={categoryOption}>
                        <span className="flex items-center gap-2">
                          <span className={`h-3 w-3 rounded-full ${optionConfig.dot}`} />
                          <Icon className="h-4 w-4" />
                          {optionConfig.label}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="timeline-title">Title</label>
              <Input
                id="timeline-title"
                value={entry.title}
                onChange={(event) => onChange({ ...entry, title: event.target.value })}
                placeholder="Business Founder"
              />
            </div>

            {config.detailLabel ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground" htmlFor="timeline-detail">{config.detailLabel}</label>
                <Input
                  id="timeline-detail"
                  value={detailValue}
                  onChange={(event) => onChange(
                    entry.category === 'work'
                      ? { ...entry, employer: event.target.value }
                      : { ...entry, institution: event.target.value }
                  )}
                  placeholder={entry.category === 'work' ? 'Company or organization' : 'School, program, or institution'}
                />
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground" htmlFor="timeline-start">Start date</label>
                <Input
                  id="timeline-start"
                  type="month"
                  value={entry.startDate}
                  onChange={(event) => onChange({ ...entry, startDate: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground" htmlFor="timeline-end">End date</label>
                <Input
                  id="timeline-end"
                  type="month"
                  value={entry.endDate || ''}
                  onChange={(event) => onChange({ ...entry, endDate: event.target.value })}
                  disabled={entry.isOngoing}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Current block</p>
                <p className="text-xs text-muted-foreground">Use this for work, school, or life chapters still happening.</p>
              </div>
              <Switch
                checked={Boolean(entry.isOngoing)}
                onCheckedChange={(checked) => onChange({ ...entry, isOngoing: checked, endDate: checked ? '' : entry.endDate })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="timeline-status">Status label</label>
              <Input
                id="timeline-status"
                value={entry.status || ''}
                onChange={(event) => onChange({ ...entry, status: event.target.value })}
                placeholder="Completed"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="timeline-description">Description</label>
              <Textarea
                id="timeline-description"
                value={entry.description || ''}
                onChange={(event) => onChange({ ...entry, description: event.target.value })}
                className="min-h-24"
                placeholder="What happened in this chapter?"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground" htmlFor="timeline-media">
                Media URLs
              </label>
              <Input
                id="timeline-media"
                value={getMediaInputValue(entry)}
                onChange={(event) => onChange({ ...entry, mediaUrls: parseMediaInputValue(event.target.value) })}
                placeholder="https://example.com/photo.jpg, https://example.com/photo-2.jpg"
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ImageIcon className="h-3.5 w-3.5" />
                Add up to four image URLs, separated by commas.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground" htmlFor="timeline-quote">Quote</label>
                <Textarea
                  id="timeline-quote"
                  value={entry.quote || ''}
                  onChange={(event) => onChange({ ...entry, quote: event.target.value })}
                  className="min-h-24"
                  placeholder="Incredible growth in the first 6 months."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground" htmlFor="timeline-quote-author">Quote author</label>
                <Input
                  id="timeline-quote-author"
                  value={entry.quoteAuthor || ''}
                  onChange={(event) => onChange({ ...entry, quoteAuthor: event.target.value })}
                  placeholder="Sarah V., Mentor"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-y-auto">
            <ReadOnlyEntryDetail entry={entry} />
          </div>
        )}

        <DialogFooter className="shrink-0 border-t border-border bg-card px-6 py-4">
          {canEdit && onDelete ? (
            <Button type="button" variant="ghost" onClick={onDelete} className="mr-auto text-red-600 hover:text-red-700">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          ) : <div />}
          <Button type="button" variant="surface" onClick={() => onOpenChange(false)}>
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          {canEdit ? (
            <Button type="button" onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          ) : null}
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
  embedded = false,
  editMode = false,
  enabled = true,
  publicVisible = true,
  onEnabledChange,
  onPublicVisibleChange,
  onUserChange,
}: ProfileTimelineProps) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [user, setUser] = useState(initialUser)
  const [timeline, setTimeline] = useState<TimelineEntry[]>(() => getTimelineProfile(initialUser.profile))
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState<TimelineDialogState>({ open: false, mode: 'view' })
  const [draftEntry, setDraftEntry] = useState<TimelineEntry>(createEmptyEntry())

  const sortedTimeline = useMemo(() => sortTimelineEntries(timeline), [timeline])
  const profileHref = profileUsername
    ? getUriWithOrg(orgslug, routePaths.org.user(profileUsername))
    : getUriWithOrg(orgslug, routePaths.org.portfolio())

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
      onUserChange?.(res.data)
      toast.success(successMessage, { id: loadingToast })
      setDialog((current) => ({ ...current, open: false }))
    } catch {
      toast.error('Could not save timeline', { id: loadingToast })
    } finally {
      setSaving(false)
    }
  }

  const openCreateDialog = () => {
    setDraftEntry(createEmptyEntry())
    setDialog({ open: true, mode: 'create' })
  }

  const openEntryDialog = (entry: TimelineEntry) => {
    setDraftEntry({ ...entry, mediaUrls: [...(entry.mediaUrls || [])] })
    setDialog({ open: true, mode: 'view' })
  }

  const handleSaveEntry = async () => {
    if (!draftEntry.title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!draftEntry.isOngoing && draftEntry.startDate && draftEntry.endDate && getMonthKey(draftEntry.startDate) > getMonthKey(draftEntry.endDate)) {
      toast.error('Start date must be earlier than or the same as end date')
      return
    }

    const nextTimeline = dialog.mode === 'create'
      ? [...timeline, draftEntry]
      : timeline.map((entry) => (entry.id === draftEntry.id ? draftEntry : entry))

    await persistTimeline(nextTimeline, dialog.mode === 'create' ? 'Timeline block added' : 'Timeline block updated')
  }

  const handleDeleteEntry = async () => {
    if (dialog.mode === 'create') return
    await persistTimeline(
      timeline.filter((entry) => entry.id !== draftEntry.id),
      'Timeline block deleted'
    )
  }

  if (!editMode && (!enabled || !publicVisible || timeline.length === 0)) return null

  const content = (
    <>
      <div className={embedded ? 'px-4 py-6 sm:px-0' : 'mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8'}>
        {!embedded ? (
          <div className="flex flex-col gap-4">
            <ContentPageHeader
              orgslug={orgslug}
              tabs={[
                { href: profileUsername ? routePaths.org.user(profileUsername) : routePaths.org.portfolio(), label: 'Portfolio' },
                { href: profileUsername ? routePaths.org.userTimeline(profileUsername) : routePaths.org.portfolioTimeline(), label: 'Timeline', active: true },
                { href: profileUsername ? routePaths.org.userResume(profileUsername) : routePaths.org.portfolioResume(), label: 'Resume' },
              ]}
              noHorizontalBleed
            />
            
          </div>
        ) : editMode && canEdit ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold text-foreground">Timeline</h2>
            <div className="flex flex-col items-end gap-2">
              <label className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{enabled ? 'On your profile' : 'Hidden from profile'}</span>
                <Switch checked={enabled} onCheckedChange={onEnabledChange} />
              </label>
              <label className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{publicVisible ? 'Visible to others' : 'Hidden from others'}</span>
                <Switch
                  checked={publicVisible}
                  onCheckedChange={onPublicVisibleChange}
                  disabled={!enabled}
                />
              </label>
            </div>
          </div>
        ) : null}

        <div className={embedded ? '' : 'mt-8'}>
          <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-4 sm:grid-cols-[52px_minmax(0,1fr)]">
            <div className="relative flex justify-center">
              <div className="absolute bottom-0 top-0 w-1.5 rounded-full bg-[#cbd8c1]" />
              <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-[#39bf00] text-white shadow-sm sm:h-11 sm:w-11">
                <Flag className="h-5 w-5" />
              </div>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 pb-5 pt-2">
              <p className="text-sm font-bold uppercase tracking-wide text-green-700">Present day</p>
              {canEdit ? (
                <Button type="button" size="icon" onClick={openCreateDialog} aria-label="Add timeline block" title="Add timeline block">
                  <Plus className="h-4 w-4" />
                </Button>
              ) : null}
            </div>

            {sortedTimeline.length > 0 ? (
              sortedTimeline.map((entry) => {
                const config = CATEGORY_CONFIG[entry.category]
                return (
                  <React.Fragment key={entry.id}>
                    <div className="relative flex justify-center">
                      <div className="absolute bottom-[-1.25rem] top-[-1.25rem] w-1.5 bg-[#cbd8c1]" />
                      <div className={`relative z-10 mt-5 h-5 w-5 rounded-full border-[3px] border-white shadow-sm ${config.dot}`} />
                    </div>
                    <div className="pb-2">
                      <TimelineCard entry={entry} canEdit={canEdit} onOpen={() => openEntryDialog(entry)} />
                    </div>
                  </React.Fragment>
                )
              })
            ) : (
              <>
                <div className="relative flex justify-center">
                  <div className="absolute bottom-0 top-[-1.25rem] w-1.5 bg-[#cbd8c1]" />
                  <div className="relative z-10 mt-5 h-5 w-5 rounded-full border-[3px] border-white bg-gray-300 shadow-sm" />
                </div>
                <div className="rounded-lg border-2 border-dashed border-border bg-muted px-6 py-10 text-center">
                  <p className="text-base font-semibold text-foreground">No timeline blocks yet</p>
                  {canEdit ? (
                    <Button type="button" className="mt-4" onClick={openCreateDialog}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add block
                    </Button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <TimelineEntryDialog
        open={dialog.open}
        entry={draftEntry}
        canEdit={canEdit}
        saving={saving}
        mode={dialog.mode}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        onChange={setDraftEntry}
        onSave={handleSaveEntry}
        onDelete={dialog.mode === 'view' ? handleDeleteEntry : null}
      />
    </>
  )

  if (embedded) {
    return <section>{content}</section>
  }

  return (
    <main className="min-h-screen">
      {content}
    </main>
  )
}
