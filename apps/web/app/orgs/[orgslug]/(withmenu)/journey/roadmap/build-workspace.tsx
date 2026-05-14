'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'react-hot-toast'
import { ArrowLeft, BarChart3, Briefcase, CheckCircle2, ChevronDown, GraduationCap, Heart, Loader2, Plus, Route, Trash2 } from 'lucide-react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  createPathwayFromEndState,
  createRoadmapEvent,
  deleteRoadmapEvent,
  getRoadmapEndStateOptions,
  getRoadmapOptions,
  RoadmapDetail,
  RoadmapEndStateOption,
  RoadmapEvent,
  RoadmapEventCategory,
  updateRoadmapEvent,
} from '@services/roadmap/roadmap'

type Props = {
  orgslug: string
  roadmapUuid?: string
}

type EventDraft = {
  event_uuid?: string
  category: RoadmapEventCategory
  title: string
  description: string
  start_date: string
  end_date: string
  is_ongoing: boolean
  estimated_monthly_income: string
  estimated_monthly_expense: string
  estimated_one_time_cost: string
}

const categories = [
  { value: 'work', label: 'Work', icon: Briefcase, color: 'border-sky-200 bg-sky-50 text-sky-700' },
  { value: 'education', label: 'Education', icon: GraduationCap, color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { value: 'life', label: 'Life', icon: Heart, color: 'border-rose-200 bg-rose-50 text-rose-700' },
] as const

function money(value?: number | null) {
  if (value === null || value === undefined) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function monthLabel(value?: string | null) {
  if (!value) return 'Open'
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

function toNumber(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function emptyDraft(): EventDraft {
  return {
    category: 'work',
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    is_ongoing: false,
    estimated_monthly_income: '',
    estimated_monthly_expense: '',
    estimated_one_time_cost: '',
  }
}

function eventToDraft(event: RoadmapEvent): EventDraft {
  return {
    event_uuid: event.event_uuid,
    category: event.category,
    title: event.title,
    description: event.description || '',
    start_date: event.start_date,
    end_date: event.end_date || '',
    is_ongoing: event.is_ongoing,
    estimated_monthly_income: event.estimated_monthly_income?.toString() || '',
    estimated_monthly_expense: event.estimated_monthly_expense?.toString() || '',
    estimated_one_time_cost: event.estimated_one_time_cost?.toString() || '',
  }
}

function PathChooser({
  orgslug,
  paths,
  selected,
  onCreate,
}: {
  orgslug: string
  paths: RoadmapDetail[]
  selected: RoadmapDetail
  onCreate: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-gray-100"
      >
        <span className="truncate text-xl font-semibold text-gray-950">{selected.option.end_state_title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
          <div className="max-h-72 overflow-y-auto p-2">
            {paths.map((path) => (
              <Link
                key={path.option.roadmap_uuid}
                href={getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(path.option.roadmap_uuid))}
                className="block rounded-lg px-3 py-2 hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                <div className="truncate text-sm font-semibold text-gray-950">{path.option.end_state_title}</div>
                <div className="text-xs text-gray-500">{path.summary.total_months || 0} months · {money(path.summary.support_needed)} support</div>
              </Link>
            ))}
          </div>
          <button type="button" onClick={() => { setOpen(false); onCreate() }} className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50">
            <Plus className="h-4 w-4" />
            New pathway
          </button>
        </div>
      ) : null}
    </div>
  )
}

function EventPanel({
  detail,
  selectedEvent,
  saving,
  onSave,
  onDelete,
}: {
  detail: RoadmapDetail
  selectedEvent?: RoadmapEvent
  saving: boolean
  onSave: (draft: EventDraft) => Promise<void>
  onDelete: (event: RoadmapEvent) => Promise<void>
}) {
  const [draft, setDraft] = useState<EventDraft>(() => selectedEvent ? eventToDraft(selectedEvent) : emptyDraft())

  React.useEffect(() => {
    setDraft(selectedEvent ? eventToDraft(selectedEvent) : emptyDraft())
  }, [selectedEvent?.event_uuid])

  const submit = async () => {
    if (!draft.title.trim() || !draft.start_date) {
      toast.error('Title and start date are required')
      return
    }
    await onSave(draft)
  }

  return (
    <aside className="h-full overflow-y-auto border-l border-gray-200 bg-white p-5 shadow-[-18px_0_45px_-32px_rgba(15,23,42,0.55)]">
      <h2 className="text-lg font-semibold text-gray-950">{selectedEvent ? 'Step details' : 'Add step'}</h2>
      <p className="mt-1 text-sm text-gray-500">{detail.option.end_state_title}</p>
      <div className="mt-5 space-y-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={draft.category} onValueChange={(value) => setDraft({ ...draft, category: value as RoadmapEventCategory })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Start</Label>
            <Input type="month" value={draft.start_date} onChange={(event) => setDraft({ ...draft, start_date: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>End</Label>
            <Input type="month" value={draft.end_date} disabled={draft.is_ongoing} onChange={(event) => setDraft({ ...draft, end_date: event.target.value })} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
          <Label>Ongoing</Label>
          <Switch checked={draft.is_ongoing} onCheckedChange={(checked) => setDraft({ ...draft, is_ongoing: checked, end_date: checked ? '' : draft.end_date })} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-2">
            <Label>Income/mo</Label>
            <Input type="number" value={draft.estimated_monthly_income} onChange={(event) => setDraft({ ...draft, estimated_monthly_income: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Expense/mo</Label>
            <Input type="number" value={draft.estimated_monthly_expense} onChange={(event) => setDraft({ ...draft, estimated_monthly_expense: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>One-time</Label>
            <Input type="number" value={draft.estimated_one_time_cost} onChange={(event) => setDraft({ ...draft, estimated_one_time_cost: event.target.value })} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="min-h-28" />
        </div>
        <div className="flex gap-2">
          {selectedEvent ? (
            <Button type="button" variant="outline" className="text-red-600" onClick={() => onDelete(selectedEvent)} disabled={saving}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          ) : null}
          <Button type="button" className="ml-auto" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    </aside>
  )
}

function OptionGridModal({
  open,
  orgslug,
  options,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  orgslug: string
  options: RoadmapEndStateOption[]
  onOpenChange: (open: boolean) => void
  onCreate: (option: RoadmapEndStateOption) => Promise<void>
}) {
  const available = options.filter((option) => option.starred && !option.built_roadmap_uuid)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Start a pathway</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          {available.map((option) => (
            <div key={option.option_uuid} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-950">{option.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-500">{option.description || 'Custom end state'}</p>
                </div>
                <Badge variant="outline" className="capitalize">{option.end_state_type}</Badge>
              </div>
              <Button type="button" className="mt-4 w-full" onClick={() => onCreate(option)}>Create pathway</Button>
            </div>
          ))}
          {!available.length ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center md:col-span-2">
              <p className="font-semibold text-gray-900">No starred unbuilt options</p>
              <Button asChild className="mt-4">
                <Link href={getUriWithOrg(orgslug, routePaths.org.journeyRoadmapExplore())}>Explore more</Link>
              </Button>
            </div>
          ) : null}
        </div>
        <Button asChild variant="outline">
          <Link href={getUriWithOrg(orgslug, routePaths.org.journeyRoadmapExplore())}>Explore more</Link>
        </Button>
      </DialogContent>
    </Dialog>
  )
}

export default function RoadmapBuildWorkspace({ orgslug, roadmapUuid }: Props) {
  const router = useRouter()
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const [selectedEventUuid, setSelectedEventUuid] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [chooserOpen, setChooserOpen] = useState(false)

  const { data: paths = [], mutate: mutatePaths, isLoading } = useSWR(
    orgId && accessToken ? ['roadmap-paths', orgId, accessToken] : null,
    ([, currentOrgId, token]) => getRoadmapOptions(currentOrgId, token),
    { revalidateOnFocus: false }
  )
  const { data: endStates = [], mutate: mutateEndStates } = useSWR(
    orgId && accessToken ? ['roadmap-end-states', orgId, accessToken] : null,
    ([, currentOrgId, token]) => getRoadmapEndStateOptions(currentOrgId, token),
    { revalidateOnFocus: false }
  )

  const selected = useMemo(() => paths.find((path) => path.option.roadmap_uuid === roadmapUuid) || paths[0], [paths, roadmapUuid])
  const selectedEvent = selected?.events.find((event) => event.event_uuid === selectedEventUuid)

  React.useEffect(() => {
    if (!roadmapUuid && selected?.option.roadmap_uuid) {
      router.replace(getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(selected.option.roadmap_uuid)))
    }
  }, [orgslug, roadmapUuid, router, selected?.option.roadmap_uuid])

  const refreshPath = async (promise: Promise<RoadmapDetail>, message: string) => {
    if (!orgId || !accessToken) return
    setSaving(true)
    const loading = toast.loading('Saving pathway')
    try {
      const next = await promise
      await mutatePaths(paths.map((path) => path.option.roadmap_uuid === next.option.roadmap_uuid ? next : path), { revalidate: false })
      toast.success(message, { id: loading })
      setSelectedEventUuid(null)
    } catch {
      toast.error('Could not save pathway', { id: loading })
    } finally {
      setSaving(false)
    }
  }

  const createPath = async (option: RoadmapEndStateOption) => {
    if (!orgId || !accessToken) return
    const detail = await createPathwayFromEndState(orgId, option.option_uuid, accessToken)
    await mutatePaths([detail, ...paths.filter((path) => path.option.roadmap_uuid !== detail.option.roadmap_uuid)], { revalidate: false })
    await mutateEndStates()
    setChooserOpen(false)
    router.push(getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(detail.option.roadmap_uuid)))
  }

  if (isLoading) {
    return <GeneralWrapperStyled><div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div></GeneralWrapperStyled>
  }

  if (!selected) {
    return (
      <GeneralWrapperStyled>
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-20 text-center">
          <Route className="mx-auto h-10 w-10 text-gray-300" />
          <h1 className="mt-4 text-2xl font-semibold text-gray-950">No pathways yet</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">Start in Explore by choosing or creating an end-state option, then turn it into a pathway.</p>
          <Button asChild className="mt-5">
            <Link href={getUriWithOrg(orgslug, routePaths.org.journeyRoadmapExplore())}>Get started</Link>
          </Button>
        </div>
      </GeneralWrapperStyled>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <GeneralWrapperStyled>
        <Breadcrumbs items={[
          { label: 'Journey', href: getUriWithOrg(orgslug, routePaths.org.journey()), icon: <Route size={14} /> },
          { label: 'Roadmap' },
        ]} />
      </GeneralWrapperStyled>
      <div className="grid min-h-[calc(100vh-180px)] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_380px]">
        <aside className="border-r border-gray-200 bg-white p-5">
          <Link href={getUriWithOrg(orgslug, routePaths.org.journey())} className="mb-5 inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-800">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Journey
          </Link>
          <PathChooser orgslug={orgslug} paths={paths} selected={selected} onCreate={() => setChooserOpen(true)} />
          <div className="mt-5 grid gap-3">
            <div className="rounded-lg border border-gray-200 p-3"><div className="text-xs text-gray-500">Timeline</div><div className="font-semibold">{selected.summary.total_months || 0} months</div></div>
            <div className="rounded-lg border border-gray-200 p-3"><div className="text-xs text-gray-500">Support needed</div><div className="font-semibold">{money(selected.summary.support_needed)}</div></div>
            <div className="rounded-lg border border-gray-200 p-3"><div className="text-xs text-gray-500">Expected income</div><div className="font-semibold">{money(selected.summary.income_mid)}</div></div>
          </div>
          <Button asChild variant="outline" className="mt-5 w-full">
            <Link href={getUriWithOrg(orgslug, routePaths.org.journeyRoadmapDetails(selected.option.roadmap_uuid))}>
              <BarChart3 className="mr-2 h-4 w-4" />
              Path details
            </Link>
          </Button>
        </aside>

        <main className="min-w-0 p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-950">Build</h1>
              <p className="text-sm text-gray-500">Timeline blocks can overlap. Click a block to edit its details.</p>
            </div>
            <Button type="button" onClick={() => setSelectedEventUuid(null)}>
              <Plus className="mr-2 h-4 w-4" />
              Add block
            </Button>
          </div>
          <div className="relative min-h-[620px] overflow-x-auto rounded-lg border border-gray-200 bg-white p-5">
            <div className="min-w-[760px] space-y-4">
              {[...selected.events].sort((a, b) => a.start_date.localeCompare(b.start_date)).map((event) => {
                const category = categories.find((item) => item.value === event.category) || categories[0]
                const Icon = category.icon
                return (
                  <button
                    key={event.event_uuid}
                    type="button"
                    onClick={() => setSelectedEventUuid(event.event_uuid)}
                    className={`grid w-full grid-cols-[150px_minmax(0,1fr)_180px] gap-4 rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${selectedEventUuid === event.event_uuid ? 'border-gray-950' : 'border-gray-200'}`}
                  >
                    <div className="text-sm font-semibold text-gray-700">{monthLabel(event.start_date)}<span className="block text-xs font-normal text-gray-400">{event.is_ongoing ? 'Ongoing' : monthLabel(event.end_date)}</span></div>
                    <div>
                      <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${category.color}`}><Icon className="h-3.5 w-3.5" />{category.label}</span>
                      <h3 className="mt-2 font-semibold text-gray-950">{event.title}</h3>
                      {event.description ? <p className="mt-1 line-clamp-2 text-sm text-gray-500">{event.description}</p> : null}
                    </div>
                    <div className="text-sm text-gray-600">
                      <div>Income {money(event.estimated_monthly_income)}/mo</div>
                      <div>Expense {money(event.estimated_monthly_expense)}/mo</div>
                      <div>Cost {money(event.estimated_one_time_cost)}</div>
                    </div>
                  </button>
                )
              })}
              {!selected.events.length ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-20 text-center">
                  <p className="font-semibold text-gray-900">No blocks yet</p>
                  <p className="mt-2 text-sm text-gray-500">Add a work, education, or life block to start building.</p>
                </div>
              ) : null}
            </div>
          </div>
        </main>

        <EventPanel
          detail={selected}
          selectedEvent={selectedEvent}
          saving={saving}
          onSave={(draft) => refreshPath(
            draft.event_uuid
              ? updateRoadmapEvent(orgId, draft.event_uuid, {
                category: draft.category,
                title: draft.title,
                description: draft.description || null,
                start_date: draft.start_date,
                end_date: draft.is_ongoing ? null : draft.end_date || null,
                is_ongoing: draft.is_ongoing,
                estimated_monthly_income: toNumber(draft.estimated_monthly_income),
                estimated_monthly_expense: toNumber(draft.estimated_monthly_expense),
                estimated_one_time_cost: toNumber(draft.estimated_one_time_cost),
              }, accessToken)
              : createRoadmapEvent(orgId, selected.option.roadmap_uuid, {
                category: draft.category,
                title: draft.title,
                description: draft.description || null,
                start_date: draft.start_date,
                end_date: draft.is_ongoing ? null : draft.end_date || null,
                is_ongoing: draft.is_ongoing,
                estimated_monthly_income: toNumber(draft.estimated_monthly_income),
                estimated_monthly_expense: toNumber(draft.estimated_monthly_expense),
                estimated_one_time_cost: toNumber(draft.estimated_one_time_cost),
              }, accessToken),
            'Pathway saved'
          )}
          onDelete={(event) => refreshPath(deleteRoadmapEvent(orgId, event.event_uuid, accessToken), 'Block deleted')}
        />
      </div>
      <OptionGridModal open={chooserOpen} orgslug={orgslug} options={endStates} onOpenChange={setChooserOpen} onCreate={createPath} />
    </div>
  )
}
