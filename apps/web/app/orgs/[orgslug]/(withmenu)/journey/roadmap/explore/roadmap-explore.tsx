'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'react-hot-toast'
import { ArrowLeft, Briefcase, CheckCircle2, GraduationCap, Heart, Loader2, Plus, Route, Star } from 'lucide-react'
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
  createRoadmapEndStateOption,
  createRoadmapTemplateEvent,
  getRoadmapEndStateOptions,
  RoadmapEndStateOption,
  RoadmapEndStateType,
  RoadmapEventCategory,
  RoadmapTemplateEvent,
  updateRoadmapEndStateOption,
} from '@services/roadmap/roadmap'

type Props = { orgslug: string }

type OptionDraft = {
  title: string
  description: string
  end_state_type: RoadmapEndStateType
  skill_fit_score: number
  lifestyle_fit_score: number
  confidence_score: number
  target_annual_income: string
  expected_annual_income_low: string
  expected_annual_income_mid: string
  expected_annual_income_high: string
  notes: string
}

type BlockDraft = {
  category: RoadmapEventCategory
  title: string
  description: string
  start_offset_months: string
  duration_months: string
  fork_group_key: string
  dependency_key: string
  optional: boolean
  estimated_monthly_income: string
  estimated_monthly_expense: string
  estimated_one_time_cost: string
}

const defaultOption: OptionDraft = {
  title: '',
  description: '',
  end_state_type: 'occupation',
  skill_fit_score: 5,
  lifestyle_fit_score: 5,
  confidence_score: 5,
  target_annual_income: '',
  expected_annual_income_low: '',
  expected_annual_income_mid: '',
  expected_annual_income_high: '',
  notes: '',
}

const defaultBlock: BlockDraft = {
  category: 'education',
  title: '',
  description: '',
  start_offset_months: '0',
  duration_months: '12',
  fork_group_key: '',
  dependency_key: '',
  optional: false,
  estimated_monthly_income: '',
  estimated_monthly_expense: '',
  estimated_one_time_cost: '',
}

const typeLabels: Record<RoadmapEndStateType, string> = {
  occupation: 'Occupation',
  entrepreneurship: 'Entrepreneurship',
  education: 'Education',
  life: 'Life',
  custom: 'Custom',
}

function money(value?: number | null) {
  if (value === null || value === undefined) return 'Not set'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function num(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function score({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><Label>{label}</Label><span className="text-xs font-semibold text-gray-500">{value}/10</span></div>
      <input type="range" min={1} max={10} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-gray-950" />
    </div>
  )
}

function OptionCard({
  option,
  onOpen,
  onToggleStar,
  onBuild,
}: {
  option: RoadmapEndStateOption
  onOpen: () => void
  onToggleStar: () => void
  onBuild: () => void
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-950">{option.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-gray-500">{option.description || 'Custom end-state option'}</p>
          </div>
          <Badge variant="outline">{typeLabels[option.end_state_type]}</Badge>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg bg-gray-50 p-2"><div className="font-semibold">{option.skill_fit_score ?? '-'}</div><div className="text-xs text-gray-500">Skill</div></div>
          <div className="rounded-lg bg-gray-50 p-2"><div className="font-semibold">{option.lifestyle_fit_score ?? '-'}</div><div className="text-xs text-gray-500">Life</div></div>
          <div className="rounded-lg bg-gray-50 p-2"><div className="font-semibold">{option.confidence_score ?? '-'}</div><div className="text-xs text-gray-500">Conf.</div></div>
        </div>
      </button>
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onToggleStar}>
          <Star className={`mr-2 h-4 w-4 ${option.starred ? 'fill-gray-950' : ''}`} />
          {option.starred ? 'Starred' : 'Star'}
        </Button>
        <Button type="button" size="sm" className="ml-auto" onClick={onBuild} disabled={Boolean(option.built_roadmap_uuid)}>
          {option.built_roadmap_uuid ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {option.built_roadmap_uuid ? 'Built' : 'Create pathway'}
        </Button>
      </div>
    </div>
  )
}

function TemplateBlockRow({ block }: { block: RoadmapTemplateEvent }) {
  const Icon = block.category === 'work' ? Briefcase : block.category === 'education' ? GraduationCap : Heart
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-gray-500" />
        <span className="font-semibold text-gray-950">{block.title}</span>
        {block.optional ? <Badge variant="outline">Optional</Badge> : null}
        {block.fork_group_key ? <Badge variant="outline">Fork {block.fork_group_key}</Badge> : null}
      </div>
      <p className="mt-1 text-sm text-gray-500">{block.duration_months} months · starts month {block.start_offset_months + 1}</p>
    </div>
  )
}

export default function RoadmapExploreClient({ orgslug }: Props) {
  const router = useRouter()
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<RoadmapEndStateOption | null>(null)
  const [draft, setDraft] = useState<OptionDraft>(defaultOption)
  const [block, setBlock] = useState<BlockDraft>(defaultBlock)
  const [saving, setSaving] = useState(false)

  const { data: options = [], isLoading, mutate } = useSWR(
    orgId && accessToken ? ['roadmap-end-state-options', orgId, accessToken] : null,
    ([, currentOrgId, token]) => getRoadmapEndStateOptions(currentOrgId, token),
    { revalidateOnFocus: false }
  )

  const saveCustom = async () => {
    if (!orgId || !accessToken) return
    if (!draft.title.trim()) {
      toast.error('End state title is required')
      return
    }
    setSaving(true)
    const loading = toast.loading('Saving option')
    try {
      const option = await createRoadmapEndStateOption(orgId, {
        title: draft.title,
        description: draft.description || null,
        end_state_type: draft.end_state_type,
        starred: true,
        skill_fit_score: draft.skill_fit_score,
        lifestyle_fit_score: draft.lifestyle_fit_score,
        confidence_score: draft.confidence_score,
        target_annual_income: num(draft.target_annual_income),
        expected_annual_income_low: num(draft.expected_annual_income_low),
        expected_annual_income_mid: num(draft.expected_annual_income_mid),
        expected_annual_income_high: num(draft.expected_annual_income_high),
        notes: draft.notes || null,
      }, accessToken)
      await mutate([option, ...options], { revalidate: false })
      setSelected(option)
      setCreateOpen(false)
      setDraft(defaultOption)
      toast.success('Option saved', { id: loading })
    } catch {
      toast.error('Could not save option', { id: loading })
    } finally {
      setSaving(false)
    }
  }

  const saveBlock = async () => {
    if (!orgId || !accessToken || !selected) return
    if (!block.title.trim()) {
      toast.error('Block title is required')
      return
    }
    const updated = await createRoadmapTemplateEvent(orgId, selected.option_uuid, {
      category: block.category,
      title: block.title,
      description: block.description || null,
      start_offset_months: Number(block.start_offset_months || 0),
      duration_months: Number(block.duration_months || 1),
      dependency_key: block.dependency_key || null,
      fork_group_key: block.fork_group_key || null,
      optional: block.optional,
      estimated_monthly_income: num(block.estimated_monthly_income),
      estimated_monthly_expense: num(block.estimated_monthly_expense),
      estimated_one_time_cost: num(block.estimated_one_time_cost),
    }, accessToken)
    setSelected(updated)
    await mutate(options.map((option) => option.option_uuid === updated.option_uuid ? updated : option), { revalidate: false })
    setBlock(defaultBlock)
  }

  const buildPathway = async (option: RoadmapEndStateOption) => {
    if (!orgId || !accessToken) return
    const detail = await createPathwayFromEndState(orgId, option.option_uuid, accessToken)
    await mutate()
    router.push(getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(detail.option.roadmap_uuid)))
  }

  const starred = options.filter((option) => option.starred)

  return (
    <GeneralWrapperStyled>
      <Breadcrumbs items={[
        { label: 'Journey', href: getUriWithOrg(orgslug, routePaths.org.journey()), icon: <Route size={14} /> },
        { label: 'Roadmap', href: getUriWithOrg(orgslug, routePaths.org.journeyRoadmap()) },
        { label: 'Explore' },
      ]} />
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={getUriWithOrg(orgslug, routePaths.org.journeyRoadmap())} className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-800">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Build workspace
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-gray-950">Explore Path Options</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">Star end states you are interested in, define starter blocks, then create pathways when ready.</p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Create your own</Button>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-950">Starred options</h2>
        {isLoading ? <div className="mt-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div> : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {starred.map((option) => (
              <OptionCard
                key={option.option_uuid}
                option={option}
                onOpen={() => setSelected(option)}
                onToggleStar={async () => {
                  if (!orgId || !accessToken) return
                  const updated = await updateRoadmapEndStateOption(orgId, option.option_uuid, { starred: !option.starred }, accessToken)
                  await mutate(options.map((item) => item.option_uuid === updated.option_uuid ? updated : item), { revalidate: false })
                }}
                onBuild={() => buildPathway(option)}
              />
            ))}
            {!starred.length ? <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm text-gray-500 md:col-span-2 xl:col-span-3">No starred options yet.</div> : null}
          </div>
        )}
      </section>

      <section className="mt-10 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-950">Discover</h2>
        <p className="mt-2 text-sm text-gray-500">Recommended path options are coming soon. For now, create your own custom option.</p>
        <Button type="button" className="mt-4" onClick={() => setCreateOpen(true)}>Create your own</Button>
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Create custom end state</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>End state</Label><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></div>
            <div className="space-y-2"><Label>Type</Label><Select value={draft.end_state_type} onValueChange={(value) => setDraft({ ...draft, end_state_type: value as RoadmapEndStateType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            {score({ label: 'Skill fit', value: draft.skill_fit_score, onChange: (value) => setDraft({ ...draft, skill_fit_score: value }) })}
            {score({ label: 'Lifestyle fit', value: draft.lifestyle_fit_score, onChange: (value) => setDraft({ ...draft, lifestyle_fit_score: value }) })}
            {score({ label: 'Confidence', value: draft.confidence_score, onChange: (value) => setDraft({ ...draft, confidence_score: value }) })}
            <div className="space-y-2"><Label>Target income</Label><Input type="number" value={draft.target_annual_income} onChange={(event) => setDraft({ ...draft, target_annual_income: event.target.value })} /></div>
            <div className="space-y-2"><Label>Low income</Label><Input type="number" value={draft.expected_annual_income_low} onChange={(event) => setDraft({ ...draft, expected_annual_income_low: event.target.value })} /></div>
            <div className="space-y-2"><Label>Mid income</Label><Input type="number" value={draft.expected_annual_income_mid} onChange={(event) => setDraft({ ...draft, expected_annual_income_mid: event.target.value })} /></div>
            <div className="space-y-2"><Label>High income</Label><Input type="number" value={draft.expected_annual_income_high} onChange={(event) => setDraft({ ...draft, expected_annual_income_high: event.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Description</Label><Textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Notes</Label><Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></div>
          </div>
          <Button type="button" onClick={saveCustom} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save option</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-5xl">
          {selected ? (
            <>
              <DialogHeader><DialogTitle>{selected.title}</DialogTitle></DialogHeader>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <p className="text-sm text-gray-500">{selected.description || 'Custom end-state option'}</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg bg-gray-50 p-3">Skill fit <strong>{selected.skill_fit_score ?? '-'}/10</strong></div>
                    <div className="rounded-lg bg-gray-50 p-3">Lifestyle <strong>{selected.lifestyle_fit_score ?? '-'}/10</strong></div>
                    <div className="rounded-lg bg-gray-50 p-3">Mid income <strong>{money(selected.expected_annual_income_mid)}</strong></div>
                  </div>
                  <h3 className="mt-6 font-semibold text-gray-950">Starter blocks</h3>
                  <div className="mt-3 space-y-2">{selected.template_events.map((item) => <TemplateBlockRow key={item.template_event_uuid} block={item} />)}</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-950">Add starter block</h3>
                  <div className="mt-4 space-y-3">
                    <Select value={block.category} onValueChange={(value) => setBlock({ ...block, category: value as RoadmapEventCategory })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="education">Education</SelectItem><SelectItem value="work">Work</SelectItem><SelectItem value="life">Life</SelectItem></SelectContent></Select>
                    <Input placeholder="Block title" value={block.title} onChange={(event) => setBlock({ ...block, title: event.target.value })} />
                    <div className="grid grid-cols-2 gap-2"><Input type="number" placeholder="Start month" value={block.start_offset_months} onChange={(event) => setBlock({ ...block, start_offset_months: event.target.value })} /><Input type="number" placeholder="Duration" value={block.duration_months} onChange={(event) => setBlock({ ...block, duration_months: event.target.value })} /></div>
                    <Input placeholder="Fork group, optional" value={block.fork_group_key} onChange={(event) => setBlock({ ...block, fork_group_key: event.target.value })} />
                    <Input placeholder="Dependency key, optional" value={block.dependency_key} onChange={(event) => setBlock({ ...block, dependency_key: event.target.value })} />
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"><Label>Optional block</Label><Switch checked={block.optional} onCheckedChange={(checked) => setBlock({ ...block, optional: checked })} /></div>
                    <Textarea placeholder="Notes" value={block.description} onChange={(event) => setBlock({ ...block, description: event.target.value })} />
                    <Button type="button" className="w-full" onClick={saveBlock}>Add block</Button>
                    <Button type="button" variant="outline" className="w-full" onClick={() => buildPathway(selected)} disabled={Boolean(selected.built_roadmap_uuid)}>Create pathway</Button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </GeneralWrapperStyled>
  )
}
