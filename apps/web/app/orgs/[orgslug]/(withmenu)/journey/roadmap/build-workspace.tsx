'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'react-hot-toast'
import { AlertTriangle, ArrowLeft, BarChart3, Briefcase, CheckCircle2, ChevronDown, GraduationCap, Heart, Loader2, Plus, Route, Search, Sparkles, Trash2 } from 'lucide-react'
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
import { Textarea } from '@components/ui/textarea'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  createRoadmapBlock,
  createRoadmapPathway,
  createRoadmapPathwayBlock,
  deleteRoadmapPathwayBlock,
  ensureDefaultRoadmapPathway,
  getRoadmapBlocks,
  getRoadmapPathways,
  RoadmapBlock,
  RoadmapBlockCategory,
  RoadmapBlockType,
  RoadmapPathwayBlock,
  RoadmapPathwayDetail,
  updateRoadmapBlock,
  updateRoadmapPathwayBlock,
} from '@services/roadmap/blocks'
import RoadmapTimeline from './roadmap-timeline'

type Props = { orgslug: string; roadmapUuid?: string }
type PanelMode = 'select' | 'detail'

type BlockDraft = {
  lane_category: RoadmapBlockCategory
  block_type: RoadmapBlockType
  title: string
  description: string
  skill_fit_score: string
  lifestyle_fit_score: string
  confidence_score: string
  target_annual_income: string
  expected_annual_income_low: string
  expected_annual_income_mid: string
  expected_annual_income_high: string
  default_monthly_income: string
  default_monthly_expense: string
  default_one_time_cost: string
  notes: string
}

type InstanceDraft = {
  start_date: string
  end_date: string
  is_ongoing: boolean
  title_override: string
  description_override: string
  monthly_income_override: string
  monthly_expense_override: string
  one_time_cost_override: string
  notes: string
}

const categories: Array<{ value: RoadmapBlockCategory; label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = [
  { value: 'work', label: 'Work', icon: Briefcase, color: 'border-sky-200 bg-sky-50 text-sky-700' },
  { value: 'education', label: 'Education', icon: GraduationCap, color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  { value: 'life', label: 'Life', icon: Heart, color: 'border-rose-200 bg-rose-50 text-rose-700' },
]

const blockTypeLabels: Record<RoadmapBlockType, string> = {
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

function toNumber(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function field(value?: number | null) {
  return value === null || value === undefined ? '' : String(value)
}

function titleFor(item: RoadmapPathwayBlock) {
  return item.title_override || item.block.title || 'Blank block'
}

function makeBlockDraft(block?: RoadmapBlock): BlockDraft {
  return {
    lane_category: block?.lane_category || 'work',
    block_type: block?.block_type || 'custom',
    title: block?.title || '',
    description: block?.description || '',
    skill_fit_score: field(block?.skill_fit_score),
    lifestyle_fit_score: field(block?.lifestyle_fit_score),
    confidence_score: field(block?.confidence_score),
    target_annual_income: field(block?.target_annual_income),
    expected_annual_income_low: field(block?.expected_annual_income_low),
    expected_annual_income_mid: field(block?.expected_annual_income_mid),
    expected_annual_income_high: field(block?.expected_annual_income_high),
    default_monthly_income: field(block?.default_monthly_income),
    default_monthly_expense: field(block?.default_monthly_expense),
    default_one_time_cost: field(block?.default_one_time_cost),
    notes: block?.notes || '',
  }
}

function makeInstanceDraft(item?: RoadmapPathwayBlock): InstanceDraft {
  const year = new Date().getFullYear()
  return {
    start_date: item?.start_date || `${year}-01`,
    end_date: item?.end_date || '',
    is_ongoing: item?.is_ongoing || false,
    title_override: item?.title_override || '',
    description_override: item?.description_override || '',
    monthly_income_override: field(item?.monthly_income_override),
    monthly_expense_override: field(item?.monthly_expense_override),
    one_time_cost_override: field(item?.one_time_cost_override),
    notes: item?.notes || '',
  }
}

function previousMonth(value: string) {
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return `${new Date().getFullYear()}-01`
  const index = year * 12 + month - 2
  return `${Math.floor(index / 12).toString().padStart(4, '0')}-${((index % 12) + 1).toString().padStart(2, '0')}`
}

function exploreInsertHref(orgslug: string, pathwayUuid?: string, targetBlockUuid?: string) {
  const base = getUriWithOrg(orgslug, routePaths.org.journeyRoadmapExplore())
  if (!pathwayUuid || !targetBlockUuid) return base
  return `${base}?insertInto=${encodeURIComponent(pathwayUuid)}&targetBlock=${encodeURIComponent(targetBlockUuid)}`
}

function PathChooser({ orgslug, paths, selected, onCreate }: { orgslug: string; paths: RoadmapPathwayDetail[]; selected: RoadmapPathwayDetail; onCreate: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex max-w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-gray-100">
        <span className="truncate text-xl font-semibold text-gray-950">{selected.pathway.title}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
          <div className="max-h-72 overflow-y-auto p-2">
            {paths.map((path) => (
              <Link key={path.pathway.pathway_uuid} href={getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(path.pathway.pathway_uuid))} className="block rounded-lg px-3 py-2 hover:bg-gray-50" onClick={() => setOpen(false)}>
                <div className="truncate text-sm font-semibold text-gray-950">{path.pathway.title}</div>
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

function BlockLibraryCard({ block, onSelect }: { block: RoadmapBlock; onSelect: () => void }) {
  const category = categories.find((item) => item.value === block.lane_category) || categories[0]
  const Icon = category.icon
  return (
    <button type="button" onClick={onSelect} className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-gray-950 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-950">{block.title || 'Untitled block'}</h3>
          <p className="mt-1 line-clamp-2 text-xs text-gray-500">{block.description || 'Saved custom block'}</p>
        </div>
        {block.editable ? <Badge variant="outline">Custom</Badge> : <Badge variant="outline">Locked</Badge>}
      </div>
      <span className={`mt-3 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${category.color}`}><Icon className="h-3.5 w-3.5" />{category.label}</span>
    </button>
  )
}

function BlockPanel({
  orgslug,
  path,
  selected,
  blocks,
  mode,
  canBack,
  saving,
  onModeChange,
  onSelectBlock,
  onCreateCustom,
  onSaveDefinition,
  onSaveInstance,
  onAddRequirement,
  onDeleteInstance,
}: {
  orgslug: string
  path: RoadmapPathwayDetail
  selected?: RoadmapPathwayBlock
  blocks: RoadmapBlock[]
  mode: PanelMode
  canBack: boolean
  saving: boolean
  onModeChange: (mode: PanelMode) => void
  onSelectBlock: (block: RoadmapBlock) => Promise<void>
  onCreateCustom: () => Promise<void>
  onSaveDefinition: (draft: BlockDraft) => Promise<void>
  onSaveInstance: (draft: InstanceDraft) => Promise<void>
  onAddRequirement: (block: RoadmapBlock) => Promise<void>
  onDeleteInstance: () => Promise<void>
}) {
  const [definition, setDefinition] = useState<BlockDraft>(() => makeBlockDraft(selected?.block))
  const [instance, setInstance] = useState<InstanceDraft>(() => makeInstanceDraft(selected))

  React.useEffect(() => {
    setDefinition(makeBlockDraft(selected?.block))
    setInstance(makeInstanceDraft(selected))
  }, [selected?.pathway_block_uuid, selected?.block.block_uuid])

  if (mode === 'select') {
    const saved = blocks.filter((block) => block.starred || block.editable)
    return (
      <aside className="h-full overflow-y-auto border-l border-gray-200 bg-white p-5 shadow-[-18px_0_45px_-32px_rgba(15,23,42,0.55)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Choose block</h2>
            <p className="mt-1 text-sm text-gray-500">{selected ? 'Replace the selected timeline block.' : 'Insert a saved block into this pathway.'}</p>
          </div>
          {canBack ? <Button type="button" variant="outline" size="sm" onClick={() => onModeChange('detail')}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button> : null}
        </div>
        <div className="mt-5 grid gap-2">
          <Button asChild variant="outline" className="justify-start">
            <Link href={exploreInsertHref(orgslug, path.pathway.pathway_uuid, selected?.pathway_block_uuid)}><Search className="mr-2 h-4 w-4" />Browse blocks</Link>
          </Button>
          <Button type="button" className="justify-start" onClick={onCreateCustom} disabled={saving}><Sparkles className="mr-2 h-4 w-4" />Create custom</Button>
        </div>
        <h3 className="mt-6 text-sm font-semibold text-gray-950">Saved blocks</h3>
        <div className="mt-3 space-y-3">
          {saved.map((block) => <BlockLibraryCard key={block.block_uuid} block={block} onSelect={() => onSelectBlock(block)} />)}
          {!saved.length ? <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">No saved blocks yet.</div> : null}
        </div>
      </aside>
    )
  }

  const editableDefinition = Boolean(selected?.block.editable)
  return (
    <aside className="h-full overflow-y-auto border-l border-gray-200 bg-white p-5 shadow-[-18px_0_45px_-32px_rgba(15,23,42,0.55)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">{selected ? titleFor(selected) : 'Block details'}</h2>
          <p className="mt-1 text-sm text-gray-500">{editableDefinition ? 'Custom block definition' : 'Locked library definition'}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onModeChange('select')}>Change</Button>
      </div>
      {selected ? (
        <div className="mt-5 space-y-6">
          <section className="space-y-4">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-950">Block definition</h3>{!editableDefinition ? <Badge variant="outline">Locked</Badge> : null}</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Lane</Label><Select disabled={!editableDefinition} value={definition.lane_category} onValueChange={(value) => setDefinition({ ...definition, lane_category: value as RoadmapBlockCategory })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Type</Label><Select disabled={!editableDefinition} value={definition.block_type} onValueChange={(value) => setDefinition({ ...definition, block_type: value as RoadmapBlockType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(blockTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="space-y-2"><Label>Title</Label><Input disabled={!editableDefinition} value={definition.title} onChange={(event) => setDefinition({ ...definition, title: event.target.value })} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea disabled={!editableDefinition} value={definition.description} onChange={(event) => setDefinition({ ...definition, description: event.target.value })} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2"><Label>Skill</Label><Input disabled={!editableDefinition} type="number" min={1} max={10} value={definition.skill_fit_score} onChange={(event) => setDefinition({ ...definition, skill_fit_score: event.target.value })} /></div>
              <div className="space-y-2"><Label>Lifestyle</Label><Input disabled={!editableDefinition} type="number" min={1} max={10} value={definition.lifestyle_fit_score} onChange={(event) => setDefinition({ ...definition, lifestyle_fit_score: event.target.value })} /></div>
              <div className="space-y-2"><Label>Confidence</Label><Input disabled={!editableDefinition} type="number" min={1} max={10} value={definition.confidence_score} onChange={(event) => setDefinition({ ...definition, confidence_score: event.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2"><Label>Target income</Label><Input disabled={!editableDefinition} type="number" value={definition.target_annual_income} onChange={(event) => setDefinition({ ...definition, target_annual_income: event.target.value })} /></div>
              <div className="space-y-2"><Label>Mid income</Label><Input disabled={!editableDefinition} type="number" value={definition.expected_annual_income_mid} onChange={(event) => setDefinition({ ...definition, expected_annual_income_mid: event.target.value })} /></div>
              <div className="space-y-2"><Label>Income low</Label><Input disabled={!editableDefinition} type="number" value={definition.expected_annual_income_low} onChange={(event) => setDefinition({ ...definition, expected_annual_income_low: event.target.value })} /></div>
              <div className="space-y-2"><Label>Income high</Label><Input disabled={!editableDefinition} type="number" value={definition.expected_annual_income_high} onChange={(event) => setDefinition({ ...definition, expected_annual_income_high: event.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2"><Label>Income/mo</Label><Input disabled={!editableDefinition} type="number" value={definition.default_monthly_income} onChange={(event) => setDefinition({ ...definition, default_monthly_income: event.target.value })} /></div>
              <div className="space-y-2"><Label>Expense/mo</Label><Input disabled={!editableDefinition} type="number" value={definition.default_monthly_expense} onChange={(event) => setDefinition({ ...definition, default_monthly_expense: event.target.value })} /></div>
              <div className="space-y-2"><Label>One-time</Label><Input disabled={!editableDefinition} type="number" value={definition.default_one_time_cost} onChange={(event) => setDefinition({ ...definition, default_one_time_cost: event.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label>Library notes</Label><Textarea disabled={!editableDefinition} value={definition.notes} onChange={(event) => setDefinition({ ...definition, notes: event.target.value })} /></div>
            {editableDefinition ? <Button type="button" onClick={() => onSaveDefinition(definition)} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save definition</Button> : null}
          </section>

          <section className="space-y-4 border-t border-gray-200 pt-5">
            <h3 className="text-sm font-semibold text-gray-950">Timeline placement</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Start</Label><Input type="month" value={instance.start_date} onChange={(event) => setInstance({ ...instance, start_date: event.target.value })} /></div>
              <div className="space-y-2"><Label>End</Label><Input type="month" disabled={instance.is_ongoing} value={instance.end_date} onChange={(event) => setInstance({ ...instance, end_date: event.target.value })} /></div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"><Label>Ongoing</Label><Switch checked={instance.is_ongoing} onCheckedChange={(checked) => setInstance({ ...instance, is_ongoing: checked, end_date: checked ? '' : instance.end_date })} /></div>
            <div className="space-y-2"><Label>Title override</Label><Input value={instance.title_override} onChange={(event) => setInstance({ ...instance, title_override: event.target.value })} /></div>
            <div className="space-y-2"><Label>Placement notes</Label><Textarea value={instance.notes} onChange={(event) => setInstance({ ...instance, notes: event.target.value })} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2"><Label>Income/mo</Label><Input type="number" value={instance.monthly_income_override} onChange={(event) => setInstance({ ...instance, monthly_income_override: event.target.value })} /></div>
              <div className="space-y-2"><Label>Expense/mo</Label><Input type="number" value={instance.monthly_expense_override} onChange={(event) => setInstance({ ...instance, monthly_expense_override: event.target.value })} /></div>
              <div className="space-y-2"><Label>One-time</Label><Input type="number" value={instance.one_time_cost_override} onChange={(event) => setInstance({ ...instance, one_time_cost_override: event.target.value })} /></div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="text-red-600" onClick={onDeleteInstance} disabled={saving}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
              <Button type="button" className="ml-auto" onClick={() => onSaveInstance(instance)} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save placement</Button>
            </div>
          </section>

          <section className="space-y-3 border-t border-gray-200 pt-5">
            <h3 className="text-sm font-semibold text-gray-950">Requirements</h3>
            {selected.unmet_requirements.map((requirement) => (
              <div key={requirement.requirement_uuid} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" />{requirement.required_block.title}</div>
                    <p className="mt-1 text-xs text-amber-800">Required before this block starts.</p>
                  </div>
                  <Button type="button" size="sm" onClick={() => onAddRequirement(requirement.required_block)} disabled={saving}><Plus className="mr-2 h-4 w-4" />Add</Button>
                </div>
              </div>
            ))}
            {!selected.unmet_requirements.length ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />Direct requirements are satisfied.</div> : null}
          </section>
        </div>
      ) : <div className="mt-8 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">Select a block on the timeline.</div>}
    </aside>
  )
}

export default function RoadmapBuildWorkspaceBlocks({ orgslug, roadmapUuid }: Props) {
  const router = useRouter()
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const [selectedBlockUuid, setSelectedBlockUuid] = useState<string | null>(null)
  const [panelMode, setPanelMode] = useState<PanelMode>('select')
  const [canBackToDetail, setCanBackToDetail] = useState(false)
  const [saving, setSaving] = useState(false)

  const { data: paths = [], mutate: mutatePaths, isLoading } = useSWR(
    orgId && accessToken ? ['roadmap-block-paths', orgId, accessToken] : null,
    async ([, currentOrgId, token]) => {
      const list = await getRoadmapPathways(currentOrgId, token)
      if (list.length) return list
      const created = await ensureDefaultRoadmapPathway(currentOrgId, token)
      return [created]
    },
    { revalidateOnFocus: false }
  )
  const { data: library = [], mutate: mutateLibrary } = useSWR(
    orgId && accessToken ? ['roadmap-block-library', orgId, accessToken] : null,
    ([, currentOrgId, token]) => getRoadmapBlocks(currentOrgId, token),
    { revalidateOnFocus: false }
  )

  const selected = useMemo(() => paths.find((path) => path.pathway.pathway_uuid === roadmapUuid) || paths[0], [paths, roadmapUuid])
  const selectedBlock = selected?.blocks.find((block) => block.pathway_block_uuid === selectedBlockUuid) || selected?.blocks[0]

  React.useEffect(() => {
    if (!selected?.pathway.pathway_uuid) return
    if (!roadmapUuid) router.replace(getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(selected.pathway.pathway_uuid)))
  }, [orgslug, roadmapUuid, router, selected?.pathway.pathway_uuid])

  React.useEffect(() => {
    if (!selected) return
    const stillSelected = selected.blocks.some((block) => block.pathway_block_uuid === selectedBlockUuid)
    if (!selectedBlockUuid || !stillSelected) {
      const first = selected.blocks[0]
      setSelectedBlockUuid(first?.pathway_block_uuid || null)
      setPanelMode(first?.block.is_draft ? 'select' : 'detail')
      setCanBackToDetail(false)
    }
  }, [selected, selectedBlockUuid])

  const replacePath = async (next: RoadmapPathwayDetail) => {
    await mutatePaths(paths.map((path) => path.pathway.pathway_uuid === next.pathway.pathway_uuid ? next : path), { revalidate: false })
  }

  const withSaving = async <T,>(message: string, action: () => Promise<T>) => {
    setSaving(true)
    const loading = toast.loading('Saving roadmap')
    try {
      const result = await action()
      toast.success(message, { id: loading })
      return result
    } catch {
      toast.error('Could not save roadmap', { id: loading })
      return undefined
    } finally {
      setSaving(false)
    }
  }

  const addBlankBlock = async () => {
    if (!orgId || !accessToken || !selected) return
    const next = await withSaving('Blank block added', () => createRoadmapPathwayBlock(orgId, selected.pathway.pathway_uuid, { start_date: `${new Date().getFullYear()}-01`, title: 'Blank block' }, accessToken))
    if (next) {
      await replacePath(next)
      setSelectedBlockUuid(next.blocks[next.blocks.length - 1]?.pathway_block_uuid || null)
      setPanelMode('select')
      setCanBackToDetail(false)
    }
  }

  const createNewPathway = async () => {
    if (!orgId || !accessToken) return
    const next = await withSaving('Pathway created', () => createRoadmapPathway(orgId, { title: 'My Pathway' }, accessToken))
    if (next) {
      await mutatePaths([next, ...paths], { revalidate: false })
      router.push(getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(next.pathway.pathway_uuid)))
    }
  }

  const selectLibraryBlock = async (block: RoadmapBlock) => {
    if (!orgId || !accessToken || !selected) return
    const target = selectedBlock
    const next = await withSaving('Block added to pathway', () => target
      ? updateRoadmapPathwayBlock(orgId, target.pathway_block_uuid, { block_uuid: block.block_uuid, title_override: null, description_override: null }, accessToken)
      : createRoadmapPathwayBlock(orgId, selected.pathway.pathway_uuid, { block_uuid: block.block_uuid, start_date: `${new Date().getFullYear()}-01` }, accessToken))
    if (next) {
      await replacePath(next)
      const updated = target ? next.blocks.find((item) => item.pathway_block_uuid === target.pathway_block_uuid) : next.blocks[next.blocks.length - 1]
      setSelectedBlockUuid(updated?.pathway_block_uuid || null)
      setPanelMode('detail')
      setCanBackToDetail(false)
    }
  }

  const createCustomForSelection = async () => {
    if (!orgId || !accessToken) return
    const block = await withSaving('Custom block created', () => createRoadmapBlock(orgId, { title: 'Untitled block', lane_category: 'work', block_type: 'custom', starred: true, is_draft: true }, accessToken))
    if (!block) return
    await mutateLibrary([block, ...library], { revalidate: false })
    await selectLibraryBlock(block)
  }

  const saveDefinition = async (draft: BlockDraft) => {
    if (!orgId || !accessToken || !selectedBlock) return
    if (!draft.title.trim()) {
      toast.error('Block title is required')
      return
    }
    const block = await withSaving('Block definition saved', () => updateRoadmapBlock(orgId, selectedBlock.block.block_uuid, {
      lane_category: draft.lane_category,
      block_type: draft.block_type,
      title: draft.title,
      description: draft.description || null,
      is_draft: false,
      skill_fit_score: toNumber(draft.skill_fit_score),
      lifestyle_fit_score: toNumber(draft.lifestyle_fit_score),
      confidence_score: toNumber(draft.confidence_score),
      target_annual_income: toNumber(draft.target_annual_income),
      expected_annual_income_low: toNumber(draft.expected_annual_income_low),
      expected_annual_income_mid: toNumber(draft.expected_annual_income_mid),
      expected_annual_income_high: toNumber(draft.expected_annual_income_high),
      default_monthly_income: toNumber(draft.default_monthly_income),
      default_monthly_expense: toNumber(draft.default_monthly_expense),
      default_one_time_cost: toNumber(draft.default_one_time_cost),
      notes: draft.notes || null,
      starred: true,
    }, accessToken))
    if (block) {
      await mutateLibrary(library.map((item) => item.block_uuid === block.block_uuid ? block : item), { revalidate: false })
      await mutatePaths()
    }
  }

  const saveInstance = async (draft: InstanceDraft) => {
    if (!orgId || !accessToken || !selectedBlock) return
    if (!draft.start_date) {
      toast.error('Start date is required')
      return
    }
    const next = await withSaving('Timeline placement saved', () => updateRoadmapPathwayBlock(orgId, selectedBlock.pathway_block_uuid, {
      start_date: draft.start_date,
      end_date: draft.is_ongoing ? null : draft.end_date || null,
      is_ongoing: draft.is_ongoing,
      title_override: draft.title_override || null,
      description_override: draft.description_override || null,
      monthly_income_override: toNumber(draft.monthly_income_override),
      monthly_expense_override: toNumber(draft.monthly_expense_override),
      one_time_cost_override: toNumber(draft.one_time_cost_override),
      notes: draft.notes || null,
    }, accessToken))
    if (next) await replacePath(next)
  }

  const addRequirement = async (block: RoadmapBlock) => {
    if (!orgId || !accessToken || !selected || !selectedBlock) return
    const date = previousMonth(selectedBlock.start_date)
    const next = await withSaving('Requirement added', () => createRoadmapPathwayBlock(orgId, selected.pathway.pathway_uuid, { block_uuid: block.block_uuid, start_date: date, end_date: date, sort_order: selected.blocks.length + 1 }, accessToken))
    if (next) {
      await replacePath(next)
      setSelectedBlockUuid(next.blocks[next.blocks.length - 1]?.pathway_block_uuid || selectedBlock.pathway_block_uuid)
      setPanelMode('detail')
    }
  }

  const deleteSelected = async () => {
    if (!orgId || !accessToken || !selectedBlock) return
    const next = await withSaving('Block removed', () => deleteRoadmapPathwayBlock(orgId, selectedBlock.pathway_block_uuid, accessToken))
    if (next) {
      await replacePath(next)
      setSelectedBlockUuid(next.blocks[0]?.pathway_block_uuid || null)
    }
  }

  if (isLoading || !selected) {
    return <GeneralWrapperStyled><div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div></GeneralWrapperStyled>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <GeneralWrapperStyled>
        <Breadcrumbs items={[{ label: 'Journey', href: getUriWithOrg(orgslug, routePaths.org.journey()), icon: <Route size={14} /> }, { label: 'Roadmap' }]} />
      </GeneralWrapperStyled>
      <div className="grid min-h-[calc(100vh-180px)] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_420px]">
        <aside className="border-r border-gray-200 bg-white p-5">
          <Link href={getUriWithOrg(orgslug, routePaths.org.journey())} className="mb-5 inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-800"><ArrowLeft className="mr-2 h-4 w-4" />Journey</Link>
          <PathChooser orgslug={orgslug} paths={paths} selected={selected} onCreate={createNewPathway} />
          <div className="mt-5 grid gap-3">
            <div className="rounded-lg border border-gray-200 p-3"><div className="text-xs text-gray-500">Timeline</div><div className="font-semibold">{selected.summary.total_months || 0} months</div></div>
            <div className="rounded-lg border border-gray-200 p-3"><div className="text-xs text-gray-500">Support needed</div><div className="font-semibold">{money(selected.summary.support_needed)}</div></div>
            <div className="rounded-lg border border-gray-200 p-3"><div className="text-xs text-gray-500">Unmet requirements</div><div className="font-semibold">{selected.summary.unmet_requirement_count}</div></div>
          </div>
          <Button asChild variant="outline" className="mt-5 w-full"><Link href={getUriWithOrg(orgslug, routePaths.org.journeyRoadmapDetails(selected.pathway.pathway_uuid))}><BarChart3 className="mr-2 h-4 w-4" />Path details</Link></Button>
        </aside>

        <main className="min-w-0 p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-950">Build</h1>
              <p className="text-sm text-gray-500">Place reusable blocks on the timeline, then resolve direct requirements as they appear.</p>
            </div>
            <Button type="button" onClick={addBlankBlock}><Plus className="mr-2 h-4 w-4" />Add block</Button>
          </div>
          <RoadmapTimeline path={selected} selectedUuid={selectedBlock?.pathway_block_uuid || null} onSelect={(uuid) => { setSelectedBlockUuid(uuid); setPanelMode('detail'); setCanBackToDetail(false) }} onAdd={addBlankBlock} />
        </main>

        <BlockPanel
          orgslug={orgslug}
          path={selected}
          selected={selectedBlock}
          blocks={library}
          mode={panelMode}
          canBack={canBackToDetail}
          saving={saving}
          onModeChange={(mode) => { setPanelMode(mode); setCanBackToDetail(mode === 'select') }}
          onSelectBlock={selectLibraryBlock}
          onCreateCustom={createCustomForSelection}
          onSaveDefinition={saveDefinition}
          onSaveInstance={saveInstance}
          onAddRequirement={addRequirement}
          onDeleteInstance={deleteSelected}
        />
      </div>
    </div>
  )
}
