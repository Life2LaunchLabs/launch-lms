'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'react-hot-toast'
import {
  ArrowLeft,
  BarChart3,
  Briefcase,
  Calendar,
  CheckCircle2,
  GraduationCap,
  Heart,
  Loader2,
  Plus,
  Route,
  Trash2,
} from 'lucide-react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Switch } from '@components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs'
import { Textarea } from '@components/ui/textarea'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  createRoadmapEvent,
  createRoadmapOption,
  createRoadmapRequirement,
  deleteRoadmapEvent,
  deleteRoadmapOption,
  deleteRoadmapRequirement,
  getRoadmapOptions,
  RoadmapDetail,
  RoadmapEndStateType,
  RoadmapEvent,
  RoadmapEventCategory,
  RoadmapEventPayload,
  RoadmapOption,
  RoadmapRequirement,
  RoadmapRequirementCategory,
  RoadmapRequirementLogic,
  updateRoadmapEvent,
  updateRoadmapOption,
  updateRoadmapRequirement,
} from '@services/roadmap/roadmap'

type RoadmapClientProps = {
  orgslug: string
  roadmapUuid?: string
}

type OptionDraft = {
  title: string
  description: string
  end_state_title: string
  end_state_type: RoadmapEndStateType
  status: 'draft' | 'active' | 'archived'
  skill_fit_score: number
  lifestyle_fit_score: number
  confidence_score: number
  target_annual_income: string
  expected_annual_income_low: string
  expected_annual_income_mid: string
  expected_annual_income_high: string
  expected_monthly_living_expenses: string
  notes: string
}

type RequirementDraft = {
  requirement_uuid?: string
  title: string
  description: string
  category: RoadmapRequirementCategory
  requirement_group_key: string
  requirement_logic: RoadmapRequirementLogic
  sort_order: number
}

type EventDraft = {
  event_uuid?: string
  category: RoadmapEventCategory
  title: string
  description: string
  start_date: string
  end_date: string
  is_ongoing: boolean
  employer: string
  institution: string
  estimated_monthly_income: string
  estimated_monthly_expense: string
  estimated_one_time_cost: string
  required_step: boolean
  requirement_uuid: string
  sort_order: number
}

const endStateTypes: { value: RoadmapEndStateType; label: string }[] = [
  { value: 'occupation', label: 'Occupation' },
  { value: 'entrepreneurship', label: 'Entrepreneurship' },
  { value: 'education', label: 'Education' },
  { value: 'life', label: 'Life' },
  { value: 'custom', label: 'Custom' },
]

const requirementCategories: { value: RoadmapRequirementCategory; label: string }[] = [
  { value: 'education', label: 'Education' },
  { value: 'work', label: 'Work' },
  { value: 'credential', label: 'Credential' },
  { value: 'life', label: 'Life' },
  { value: 'financial', label: 'Financial' },
  { value: 'custom', label: 'Custom' },
]

const eventCategories: { value: RoadmapEventCategory; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { value: 'work', label: 'Work', icon: Briefcase, color: 'text-sky-700 bg-sky-50 border-sky-100' },
  { value: 'education', label: 'Education', icon: GraduationCap, color: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
  { value: 'life', label: 'Life', icon: Heart, color: 'text-rose-700 bg-rose-50 border-rose-100' },
]

function money(value?: number | null) {
  if (value === null || value === undefined) return 'Not set'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function monthLabel(value?: string | null) {
  if (!value) return 'Not set'
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

function numberOrNull(value: string) {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function scoreOrDefault(value: number | null | undefined, fallback = 5) {
  return value ?? fallback
}

function optionToDraft(option?: RoadmapOption): OptionDraft {
  return {
    title: option?.title || '',
    description: option?.description || '',
    end_state_title: option?.end_state_title || '',
    end_state_type: option?.end_state_type || 'occupation',
    status: option?.status || 'draft',
    skill_fit_score: scoreOrDefault(option?.skill_fit_score),
    lifestyle_fit_score: scoreOrDefault(option?.lifestyle_fit_score),
    confidence_score: scoreOrDefault(option?.confidence_score),
    target_annual_income: option?.target_annual_income?.toString() || '',
    expected_annual_income_low: option?.expected_annual_income_low?.toString() || '',
    expected_annual_income_mid: option?.expected_annual_income_mid?.toString() || '',
    expected_annual_income_high: option?.expected_annual_income_high?.toString() || '',
    expected_monthly_living_expenses: option?.expected_monthly_living_expenses?.toString() || '',
    notes: option?.notes || '',
  }
}

function optionPayload(draft: OptionDraft) {
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    end_state_title: draft.end_state_title.trim(),
    end_state_type: draft.end_state_type,
    status: draft.status,
    skill_fit_score: draft.skill_fit_score,
    lifestyle_fit_score: draft.lifestyle_fit_score,
    confidence_score: draft.confidence_score,
    target_annual_income: numberOrNull(draft.target_annual_income),
    expected_annual_income_low: numberOrNull(draft.expected_annual_income_low),
    expected_annual_income_mid: numberOrNull(draft.expected_annual_income_mid),
    expected_annual_income_high: numberOrNull(draft.expected_annual_income_high),
    expected_monthly_living_expenses: numberOrNull(draft.expected_monthly_living_expenses),
    notes: draft.notes.trim() || null,
  }
}

function emptyRequirement(): RequirementDraft {
  return {
    title: '',
    description: '',
    category: 'education',
    requirement_group_key: '',
    requirement_logic: 'required',
    sort_order: 0,
  }
}

function requirementToDraft(requirement: RoadmapRequirement): RequirementDraft {
  return {
    requirement_uuid: requirement.requirement_uuid,
    title: requirement.title,
    description: requirement.description || '',
    category: requirement.category,
    requirement_group_key: requirement.requirement_group_key || '',
    requirement_logic: requirement.requirement_logic,
    sort_order: requirement.sort_order,
  }
}

function requirementPayload(draft: RequirementDraft) {
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    category: draft.category,
    requirement_group_key: draft.requirement_group_key.trim() || null,
    requirement_logic: draft.requirement_logic,
    sort_order: draft.sort_order,
  }
}

function emptyEvent(): EventDraft {
  return {
    category: 'work',
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    is_ongoing: false,
    employer: '',
    institution: '',
    estimated_monthly_income: '',
    estimated_monthly_expense: '',
    estimated_one_time_cost: '',
    required_step: false,
    requirement_uuid: '',
    sort_order: 0,
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
    employer: event.employer || '',
    institution: event.institution || '',
    estimated_monthly_income: event.estimated_monthly_income?.toString() || '',
    estimated_monthly_expense: event.estimated_monthly_expense?.toString() || '',
    estimated_one_time_cost: event.estimated_one_time_cost?.toString() || '',
    required_step: event.required_step,
    requirement_uuid: event.requirement_uuid || '',
    sort_order: event.sort_order,
  }
}

function eventPayload(draft: EventDraft): RoadmapEventPayload {
  return {
    category: draft.category,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    start_date: draft.start_date,
    end_date: draft.is_ongoing ? null : draft.end_date || null,
    is_ongoing: draft.is_ongoing,
    employer: draft.employer.trim() || null,
    institution: draft.institution.trim() || null,
    estimated_monthly_income: numberOrNull(draft.estimated_monthly_income),
    estimated_monthly_expense: numberOrNull(draft.estimated_monthly_expense),
    estimated_one_time_cost: numberOrNull(draft.estimated_one_time_cost),
    required_step: draft.required_step,
    requirement_uuid: draft.requirement_uuid || null,
    sort_order: draft.sort_order,
  }
}

function ScoreInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{value}/10</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-gray-950"
      />
    </div>
  )
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-gray-950">{value}</div>
    </div>
  )
}

function RoadmapSidebar({
  orgslug,
  roadmaps,
  selected,
  onCreate,
}: {
  orgslug: string
  roadmaps: RoadmapDetail[]
  selected?: RoadmapDetail
  onCreate: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg bg-white nice-shadow">
        <div className="border-b border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-950 text-white">
              <Route className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-gray-900">Roadmap</h2>
              <p className="text-xs text-gray-500">{roadmaps.length} path option{roadmaps.length === 1 ? '' : 's'}</p>
            </div>
          </div>
        </div>
        <div className="max-h-[420px] space-y-1 overflow-y-auto p-2">
          {roadmaps.map((roadmap) => {
            const active = selected?.option.roadmap_uuid === roadmap.option.roadmap_uuid
            return (
              <Link
                key={roadmap.option.roadmap_uuid}
                href={getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(roadmap.option.roadmap_uuid))}
                className={`block rounded-lg p-3 transition ${active ? 'bg-gray-950 text-white' : 'hover:bg-gray-50'}`}
              >
                <div className="truncate text-sm font-semibold">{roadmap.option.title}</div>
                <div className={`mt-1 truncate text-xs ${active ? 'text-white/70' : 'text-gray-500'}`}>
                  {roadmap.option.end_state_title || 'No end state'}
                </div>
              </Link>
            )
          })}
          {!roadmaps.length ? (
            <div className="px-3 py-8 text-center text-sm text-gray-500">No roadmap options yet</div>
          ) : null}
        </div>
        <div className="border-t border-gray-100 p-4">
          <Button type="button" className="w-full" onClick={onCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New option
          </Button>
        </div>
      </div>

      {selected ? (
        <div className="rounded-lg bg-white p-4 nice-shadow">
          <h3 className="text-sm font-semibold text-gray-900">Quick read</h3>
          <div className="mt-3 space-y-2 text-sm text-gray-600">
            <div className="flex justify-between gap-3">
              <span>Total time</span>
              <span className="font-medium text-gray-900">{selected.summary.total_months || 0} mo</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Support needed</span>
              <span className="font-medium text-gray-900">{money(selected.summary.support_needed)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Requirements</span>
              <span className="font-medium text-gray-900">
                {selected.summary.satisfied_requirement_count}/{selected.summary.requirement_count}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function OptionEditor({
  detail,
  saving,
  onSave,
}: {
  detail: RoadmapDetail
  saving: boolean
  onSave: (draft: OptionDraft) => Promise<void>
}) {
  const [draft, setDraft] = useState<OptionDraft>(() => optionToDraft(detail.option))

  useEffect(() => {
    setDraft(optionToDraft(detail.option))
  }, [detail.option.roadmap_uuid])

  return (
    <div className="space-y-5 rounded-lg border border-gray-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-950">End state</h2>
        <p className="mt-1 text-sm text-gray-500">Declare the option in your own terms. These are your assumptions.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="roadmap-title">Roadmap title</Label>
          <Input id="roadmap-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end-state-title">End state</Label>
          <Input id="end-state-title" value={draft.end_state_title} onChange={(event) => setDraft({ ...draft, end_state_title: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={draft.end_state_type} onValueChange={(value) => setDraft({ ...draft, end_state_type: value as RoadmapEndStateType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {endStateTypes.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={draft.status} onValueChange={(value) => setDraft({ ...draft, status: value as OptionDraft['status'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ScoreInput label="Skill fit" value={draft.skill_fit_score} onChange={(value) => setDraft({ ...draft, skill_fit_score: value })} />
        <ScoreInput label="Lifestyle fit" value={draft.lifestyle_fit_score} onChange={(value) => setDraft({ ...draft, lifestyle_fit_score: value })} />
        <ScoreInput label="Confidence" value={draft.confidence_score} onChange={(value) => setDraft({ ...draft, confidence_score: value })} />
      </div>
      <div className="grid gap-4 md:grid-cols-5">
        <div className="space-y-2">
          <Label>Target income</Label>
          <Input type="number" value={draft.target_annual_income} onChange={(event) => setDraft({ ...draft, target_annual_income: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Low income</Label>
          <Input type="number" value={draft.expected_annual_income_low} onChange={(event) => setDraft({ ...draft, expected_annual_income_low: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Mid income</Label>
          <Input type="number" value={draft.expected_annual_income_mid} onChange={(event) => setDraft({ ...draft, expected_annual_income_mid: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>High income</Label>
          <Input type="number" value={draft.expected_annual_income_high} onChange={(event) => setDraft({ ...draft, expected_annual_income_high: event.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Monthly living</Label>
          <Input type="number" value={draft.expected_monthly_living_expenses} onChange={(event) => setDraft({ ...draft, expected_monthly_living_expenses: event.target.value })} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="min-h-28" />
        </div>
        <div className="space-y-2">
          <Label>Notes and assumptions</Label>
          <Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className="min-h-28" />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={() => onSave(draft)} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save end state
        </Button>
      </div>
    </div>
  )
}

function RequirementsEditor({
  detail,
  saving,
  onSave,
  onDelete,
}: {
  detail: RoadmapDetail
  saving: boolean
  onSave: (draft: RequirementDraft) => Promise<void>
  onDelete: (requirement: RoadmapRequirement) => Promise<void>
}) {
  const [draft, setDraft] = useState<RequirementDraft>(emptyRequirement())

  const grouped = useMemo(() => {
    const result = new Map<string, RoadmapRequirement[]>()
    detail.requirements.forEach((requirement) => {
      const key = requirement.requirement_logic === 'one_of' && requirement.requirement_group_key
        ? requirement.requirement_group_key
        : requirement.requirement_uuid
      result.set(key, [...(result.get(key) || []), requirement])
    })
    return Array.from(result.entries())
  }, [detail.requirements])

  const submit = async () => {
    if (!draft.title.trim()) {
      toast.error('Requirement title is required')
      return
    }
    await onSave(draft)
    setDraft(emptyRequirement())
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-3">
        {grouped.map(([key, requirements]) => (
          <div key={key} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-900">
                {requirements[0].requirement_logic === 'one_of' ? 'One of these' : 'Required'}
              </div>
              {requirements[0].requirement_logic === 'one_of' ? <Badge variant="outline">{requirements[0].requirement_group_key}</Badge> : null}
            </div>
            <div className="space-y-2">
              {requirements.map((requirement) => (
                <button
                  key={requirement.requirement_uuid}
                  type="button"
                  onClick={() => setDraft(requirementToDraft(requirement))}
                  className="flex w-full items-start justify-between gap-3 rounded-lg border border-gray-100 p-3 text-left hover:bg-gray-50"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      {requirement.satisfied_by_event_uuid ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                      <span className="text-sm font-semibold text-gray-950">{requirement.title}</span>
                    </div>
                    {requirement.description ? <p className="mt-1 text-sm text-gray-500">{requirement.description}</p> : null}
                  </div>
                  <span className="text-xs capitalize text-gray-400">{requirement.category}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {!detail.requirements.length ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
            <p className="font-semibold text-gray-800">No required steps yet</p>
            <p className="mt-2 text-sm text-gray-500">Add credentials, education, work, financial, or life requirements.</p>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="font-semibold text-gray-950">{draft.requirement_uuid ? 'Edit requirement' : 'Add requirement'}</h3>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={draft.category} onValueChange={(value) => setDraft({ ...draft, category: value as RoadmapRequirementCategory })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {requirementCategories.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Logic</Label>
            <Select value={draft.requirement_logic} onValueChange={(value) => setDraft({ ...draft, requirement_logic: value as RoadmapRequirementLogic })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="required">Required</SelectItem>
                <SelectItem value="one_of">One of a group</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {draft.requirement_logic === 'one_of' ? (
            <div className="space-y-2">
              <Label>Group key</Label>
              <Input value={draft.requirement_group_key} onChange={(event) => setDraft({ ...draft, requirement_group_key: event.target.value })} placeholder="secondary_credential" />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
          <div className="flex gap-2">
            {draft.requirement_uuid ? (
              <Button
                type="button"
                variant="outline"
                className="text-red-600"
                onClick={() => {
                  const requirement = detail.requirements.find((item) => item.requirement_uuid === draft.requirement_uuid)
                  if (requirement) onDelete(requirement).then(() => setDraft(emptyRequirement()))
                }}
                disabled={saving}
              >
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
      </div>
    </div>
  )
}

function TimelineEditor({
  detail,
  saving,
  onSave,
  onDelete,
}: {
  detail: RoadmapDetail
  saving: boolean
  onSave: (draft: EventDraft) => Promise<void>
  onDelete: (event: RoadmapEvent) => Promise<void>
}) {
  const [draft, setDraft] = useState<EventDraft>(emptyEvent())
  const sortedEvents = [...detail.events].sort((a, b) => a.start_date.localeCompare(b.start_date))

  const submit = async () => {
    if (!draft.title.trim()) {
      toast.error('Step title is required')
      return
    }
    if (!draft.start_date) {
      toast.error('Start date is required')
      return
    }
    await onSave(draft)
    setDraft(emptyEvent())
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-950">Timeline</h2>
          <Badge variant="outline">{detail.events.length} step{detail.events.length === 1 ? '' : 's'}</Badge>
        </div>
        <div className="space-y-3">
          {sortedEvents.map((event) => {
            const config = eventCategories.find((category) => category.value === event.category) || eventCategories[0]
            const Icon = config.icon
            return (
              <button
                key={event.event_uuid}
                type="button"
                onClick={() => setDraft(eventToDraft(event))}
                className="grid w-full gap-3 rounded-lg border border-gray-200 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md md:grid-cols-[160px_minmax(0,1fr)_180px]"
              >
                <div className="text-sm font-semibold text-gray-700">
                  {monthLabel(event.start_date)}
                  <span className="block text-xs font-normal text-gray-400">{event.is_ongoing ? 'Ongoing' : monthLabel(event.end_date)}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${config.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {config.label}
                    </span>
                    {event.required_step ? <Badge variant="outline">Required</Badge> : null}
                  </div>
                  <h3 className="mt-2 font-semibold text-gray-950">{event.title}</h3>
                  {event.description ? <p className="mt-1 line-clamp-2 text-sm text-gray-500">{event.description}</p> : null}
                </div>
                <div className="text-sm text-gray-600">
                  <div>Income: <span className="font-medium text-gray-900">{money(event.estimated_monthly_income)}/mo</span></div>
                  <div>Expense: <span className="font-medium text-gray-900">{money(event.estimated_monthly_expense)}/mo</span></div>
                  <div>Cost: <span className="font-medium text-gray-900">{money(event.estimated_one_time_cost)}</span></div>
                </div>
              </button>
            )
          })}
          {!sortedEvents.length ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
              <p className="font-semibold text-gray-800">No timeline steps yet</p>
              <p className="mt-2 text-sm text-gray-500">Add work, education, and life steps to build this option.</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="font-semibold text-gray-950">{draft.event_uuid ? 'Edit timeline step' : 'Add timeline step'}</h3>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>Step type</Label>
            <Select value={draft.category} onValueChange={(value) => setDraft({ ...draft, category: value as RoadmapEventCategory })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {eventCategories.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </div>
          {draft.category === 'work' ? (
            <div className="space-y-2">
              <Label>Employer or role</Label>
              <Input value={draft.employer} onChange={(event) => setDraft({ ...draft, employer: event.target.value })} />
            </div>
          ) : null}
          {draft.category === 'education' ? (
            <div className="space-y-2">
              <Label>School, program, or provider</Label>
              <Input value={draft.institution} onChange={(event) => setDraft({ ...draft, institution: event.target.value })} />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start</Label>
              <Input type="month" value={draft.start_date} onChange={(event) => setDraft({ ...draft, start_date: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>End</Label>
              <Input type="month" value={draft.end_date} onChange={(event) => setDraft({ ...draft, end_date: event.target.value })} disabled={draft.is_ongoing} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
            <Label>Ongoing / open-ended</Label>
            <Switch checked={draft.is_ongoing} onCheckedChange={(checked) => setDraft({ ...draft, is_ongoing: checked, end_date: checked ? '' : draft.end_date })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
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
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
            <Label>Required step</Label>
            <Switch checked={draft.required_step} onCheckedChange={(checked) => setDraft({ ...draft, required_step: checked })} />
          </div>
          <div className="space-y-2">
            <Label>Satisfies requirement</Label>
            <Select value={draft.requirement_uuid || 'none'} onValueChange={(value) => setDraft({ ...draft, requirement_uuid: value === 'none' ? '' : value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {detail.requirements.map((requirement) => (
                  <SelectItem key={requirement.requirement_uuid} value={requirement.requirement_uuid}>{requirement.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes / assumptions</Label>
            <Textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
          <div className="flex gap-2">
            {draft.event_uuid ? (
              <Button
                type="button"
                variant="outline"
                className="text-red-600"
                onClick={() => {
                  const event = detail.events.find((item) => item.event_uuid === draft.event_uuid)
                  if (event) onDelete(event).then(() => setDraft(emptyEvent()))
                }}
                disabled={saving}
              >
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
      </div>
    </div>
  )
}

function SummaryPanel({ detail }: { detail: RoadmapDetail }) {
  const summary = detail.summary
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Calendar} label="Total time" value={summary.total_months ? `${summary.total_months} months` : 'Not set'} />
        <MetricCard icon={Briefcase} label="First income" value={summary.months_until_first_income ? `${summary.months_until_first_income} months in` : 'Not set'} />
        <MetricCard icon={BarChart3} label="Support needed" value={money(summary.support_needed)} />
        <MetricCard icon={CheckCircle2} label="Requirements" value={`${summary.satisfied_requirement_count}/${summary.requirement_count}`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-950">Financial sustainability</h2>
          <p className="mt-1 text-sm text-gray-500">Based on your estimates.</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><span>Total estimated income</span><span className="font-semibold">{money(summary.total_estimated_income)}</span></div>
            <div className="flex justify-between gap-3"><span>Total estimated cost</span><span className="font-semibold">{money(summary.total_estimated_cost)}</span></div>
            <div className="flex justify-between gap-3"><span>Lowest cash position</span><span className="font-semibold">{money(summary.lowest_projected_cash_position)}</span></div>
            <div className="flex justify-between gap-3"><span>Monthly living expenses</span><span className="font-semibold">{money(summary.monthly_living_expenses)}</span></div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-950">End-state alignment</h2>
          <p className="mt-1 text-sm text-gray-500">{detail.option.end_state_title}</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-gray-50 p-3 text-center"><div className="text-2xl font-semibold">{summary.skill_fit_score ?? '-'}</div><div className="text-xs text-gray-500">Skill fit</div></div>
            <div className="rounded-lg bg-gray-50 p-3 text-center"><div className="text-2xl font-semibold">{summary.lifestyle_fit_score ?? '-'}</div><div className="text-xs text-gray-500">Lifestyle</div></div>
            <div className="rounded-lg bg-gray-50 p-3 text-center"><div className="text-2xl font-semibold">{summary.confidence_score ?? '-'}</div><div className="text-xs text-gray-500">Confidence</div></div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            Expected income: {money(summary.income_low)} / {money(summary.income_mid)} / {money(summary.income_high)}
          </div>
        </div>
      </div>
    </div>
  )
}

function ComparePanel({ roadmaps }: { roadmaps: RoadmapDetail[] }) {
  if (roadmaps.length < 2) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
        <p className="font-semibold text-gray-800">Create another roadmap option to compare</p>
        <p className="mt-2 text-sm text-gray-500">Comparison becomes useful once you have two or more options.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-[0.12em] text-gray-500">
            <tr>
              <th className="px-4 py-3">Option</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">First income</th>
              <th className="px-4 py-3">Support</th>
              <th className="px-4 py-3">Total cost</th>
              <th className="px-4 py-3">Income range</th>
              <th className="px-4 py-3">Fit</th>
              <th className="px-4 py-3">Reqs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {roadmaps.map((roadmap) => (
              <tr key={roadmap.option.roadmap_uuid}>
                <td className="px-4 py-4">
                  <div className="font-semibold text-gray-950">{roadmap.option.title}</div>
                  <div className="text-xs text-gray-500">{roadmap.option.end_state_title}</div>
                </td>
                <td className="px-4 py-4">{roadmap.summary.total_months} mo</td>
                <td className="px-4 py-4">{roadmap.summary.months_until_first_income ? `${roadmap.summary.months_until_first_income} mo` : 'Not set'}</td>
                <td className="px-4 py-4">{money(roadmap.summary.support_needed)}</td>
                <td className="px-4 py-4">{money(roadmap.summary.total_estimated_cost)}</td>
                <td className="px-4 py-4">{money(roadmap.summary.income_low)} / {money(roadmap.summary.income_mid)} / {money(roadmap.summary.income_high)}</td>
                <td className="px-4 py-4">{roadmap.summary.skill_fit_score ?? '-'}/{roadmap.summary.lifestyle_fit_score ?? '-'}</td>
                <td className="px-4 py-4">{roadmap.summary.satisfied_requirement_count}/{roadmap.summary.requirement_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function RoadmapClient({ orgslug, roadmapUuid }: RoadmapClientProps) {
  const router = useRouter()
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)

  const { data, isLoading, mutate } = useSWR(
    orgId && accessToken ? ['roadmap-options', orgId, accessToken] : null,
    ([, currentOrgId, token]) => getRoadmapOptions(currentOrgId, token),
    { revalidateOnFocus: false }
  )

  const roadmaps = data || []
  const selected = useMemo(() => {
    if (!roadmaps.length) return undefined
    return roadmaps.find((roadmap) => roadmap.option.roadmap_uuid === roadmapUuid) || roadmaps[0]
  }, [roadmaps, roadmapUuid])

  useEffect(() => {
    if (!roadmapUuid && selected?.option.roadmap_uuid) {
      router.replace(getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(selected.option.roadmap_uuid)))
    }
  }, [orgslug, roadmapUuid, router, selected?.option.roadmap_uuid])

  const requireReady = () => {
    if (!orgId || !accessToken) {
      toast.error('Sign in to save your roadmap')
      return false
    }
    return true
  }

  const refreshWith = async (promise: Promise<RoadmapDetail>, message: string) => {
    if (!requireReady()) return
    setSaving(true)
    const loading = toast.loading('Saving roadmap')
    try {
      const detail = await promise
      await mutate((current) => {
        const existing = current || []
        const found = existing.some((item) => item.option.roadmap_uuid === detail.option.roadmap_uuid)
        return found
          ? existing.map((item) => item.option.roadmap_uuid === detail.option.roadmap_uuid ? detail : item)
          : [detail, ...existing]
      }, { revalidate: false })
      toast.success(message, { id: loading })
    } catch {
      toast.error('Could not save roadmap', { id: loading })
    } finally {
      setSaving(false)
    }
  }

  const handleCreateOption = async () => {
    if (!requireReady()) return
    setCreating(true)
    const loading = toast.loading('Creating roadmap')
    try {
      const detail = await createRoadmapOption(orgId, {
        title: 'New roadmap option',
        end_state_title: 'New end state',
        end_state_type: 'occupation',
        status: 'draft',
        skill_fit_score: 5,
        lifestyle_fit_score: 5,
        confidence_score: 5,
      }, accessToken)
      await mutate([detail, ...(roadmaps || [])], { revalidate: false })
      toast.success('Roadmap created', { id: loading })
      router.push(getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(detail.option.roadmap_uuid)))
    } catch {
      toast.error('Could not create roadmap', { id: loading })
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteOption = async () => {
    if (!selected || !requireReady()) return
    const confirmed = window.confirm(`Delete "${selected.option.title}"?`)
    if (!confirmed) return
    const loading = toast.loading('Deleting roadmap')
    try {
      await deleteRoadmapOption(orgId, selected.option.roadmap_uuid, accessToken)
      const next = roadmaps.filter((item) => item.option.roadmap_uuid !== selected.option.roadmap_uuid)
      await mutate(next, { revalidate: false })
      toast.success('Roadmap deleted', { id: loading })
      router.push(getUriWithOrg(orgslug, routePaths.org.journeyRoadmap()))
    } catch {
      toast.error('Could not delete roadmap', { id: loading })
    }
  }

  const breadcrumbs = [
    { label: 'Journey', href: getUriWithOrg(orgslug, routePaths.org.journey()), icon: <Route size={14} /> },
    { label: 'Roadmap' },
  ]

  return (
    <GeneralWrapperStyled>
      <div className="pb-4">
        <Breadcrumbs items={breadcrumbs} />
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={getUriWithOrg(orgslug, routePaths.org.journey())} className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-800">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Journey
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">Roadmap</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Build future path options from your own end-state, timeline, and financial assumptions.
          </p>
        </div>
        <Button type="button" onClick={handleCreateOption} disabled={creating}>
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          New option
        </Button>
      </div>

      {isLoading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-gray-200 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : !selected ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-16 text-center">
          <Route className="mx-auto h-10 w-10 text-gray-300" />
          <h2 className="mt-4 text-xl font-semibold text-gray-950">Create your first roadmap option</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
            Start with an end state, then add required steps and timeline estimates. You can compare options once you have more than one.
          </p>
          <Button type="button" className="mt-5" onClick={handleCreateOption} disabled={creating}>
            <Plus className="mr-2 h-4 w-4" />
            Create roadmap
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="w-full flex-shrink-0 md:w-72 lg:w-80">
            <div className="sticky top-24">
              <RoadmapSidebar orgslug={orgslug} roadmaps={roadmaps} selected={selected} onCreate={handleCreateOption} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-semibold tracking-tight text-gray-950">{selected.option.title}</h2>
                    <Badge variant="outline" className="capitalize">{selected.option.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">{selected.option.end_state_title}</p>
                </div>
                <Button type="button" variant="outline" className="text-red-600" onClick={handleDeleteOption}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>

            <Tabs defaultValue="end-state" className="w-full">
              <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start bg-gray-100">
                <TabsTrigger value="end-state">End State</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="compare">Compare</TabsTrigger>
              </TabsList>
              <TabsContent value="end-state" className="space-y-5">
                <OptionEditor
                  detail={selected}
                  saving={saving}
                  onSave={(draft) => {
                    if (!draft.title.trim() || !draft.end_state_title.trim()) {
                      toast.error('Roadmap title and end state are required')
                      return Promise.resolve()
                    }
                    return refreshWith(updateRoadmapOption(orgId, selected.option.roadmap_uuid, optionPayload(draft), accessToken), 'End state saved')
                  }}
                />
                <RequirementsEditor
                  detail={selected}
                  saving={saving}
                  onSave={(draft) => refreshWith(
                    draft.requirement_uuid
                      ? updateRoadmapRequirement(orgId, draft.requirement_uuid, requirementPayload(draft), accessToken)
                      : createRoadmapRequirement(orgId, selected.option.roadmap_uuid, requirementPayload(draft), accessToken),
                    'Requirement saved'
                  )}
                  onDelete={(requirement) => refreshWith(deleteRoadmapRequirement(orgId, requirement.requirement_uuid, accessToken), 'Requirement deleted')}
                />
              </TabsContent>
              <TabsContent value="timeline">
                <TimelineEditor
                  detail={selected}
                  saving={saving}
                  onSave={(draft) => refreshWith(
                    draft.event_uuid
                      ? updateRoadmapEvent(orgId, draft.event_uuid, eventPayload(draft), accessToken)
                      : createRoadmapEvent(orgId, selected.option.roadmap_uuid, eventPayload(draft), accessToken),
                    'Timeline saved'
                  )}
                  onDelete={(event) => refreshWith(deleteRoadmapEvent(orgId, event.event_uuid, accessToken), 'Timeline step deleted')}
                />
              </TabsContent>
              <TabsContent value="summary">
                <SummaryPanel detail={selected} />
              </TabsContent>
              <TabsContent value="compare">
                <ComparePanel roadmaps={roadmaps} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </GeneralWrapperStyled>
  )
}
