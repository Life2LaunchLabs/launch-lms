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
import { Textarea } from '@components/ui/textarea'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { createRoadmapBlock, createRoadmapPathwayBlock, getRoadmapBlocks, RoadmapBlock, RoadmapBlockCategory, RoadmapBlockType, updateRoadmapBlock, updateRoadmapPathwayBlock } from '@services/roadmap/blocks'

type Props = { orgslug: string; insertInto?: string; targetBlock?: string }
type Draft = {
  title: string
  description: string
  lane_category: RoadmapBlockCategory
  block_type: RoadmapBlockType
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

const defaultDraft: Draft = {
  title: '',
  description: '',
  lane_category: 'work',
  block_type: 'custom',
  skill_fit_score: '',
  lifestyle_fit_score: '',
  confidence_score: '',
  target_annual_income: '',
  expected_annual_income_low: '',
  expected_annual_income_mid: '',
  expected_annual_income_high: '',
  default_monthly_income: '',
  default_monthly_expense: '',
  default_one_time_cost: '',
  notes: '',
}

const categories: Record<RoadmapBlockCategory, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  work: { label: 'Work', icon: Briefcase, className: 'border-sky-200 bg-sky-50 text-sky-700' },
  education: { label: 'Education', icon: GraduationCap, className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  life: { label: 'Life', icon: Heart, className: 'border-rose-200 bg-rose-50 text-rose-700' },
}

const typeLabels: Record<RoadmapBlockType, string> = {
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
  if (value === null || value === undefined) return 'Not set'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function num(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function BlockCard({ block, inserting, onOpen, onToggleStar, onInsert }: { block: RoadmapBlock; inserting: boolean; onOpen: () => void; onToggleStar: () => void; onInsert: () => void }) {
  const category = categories[block.lane_category]
  const Icon = category.icon
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-950">{block.title || 'Untitled block'}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-gray-500">{block.description || 'Custom roadmap block'}</p>
          </div>
          <Badge variant="outline">{typeLabels[block.block_type]}</Badge>
        </div>
        <span className={`mt-4 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${category.className}`}><Icon className="h-3.5 w-3.5" />{category.label}</span>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg bg-gray-50 p-2"><div className="font-semibold">{block.skill_fit_score ?? '-'}</div><div className="text-xs text-gray-500">Skill</div></div>
          <div className="rounded-lg bg-gray-50 p-2"><div className="font-semibold">{block.lifestyle_fit_score ?? '-'}</div><div className="text-xs text-gray-500">Life</div></div>
          <div className="rounded-lg bg-gray-50 p-2"><div className="font-semibold">{block.confidence_score ?? '-'}</div><div className="text-xs text-gray-500">Conf.</div></div>
        </div>
      </button>
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onToggleStar} disabled={!block.editable}>
          <Star className={`mr-2 h-4 w-4 ${block.starred ? 'fill-gray-950' : ''}`} />
          {block.starred ? 'Starred' : 'Star'}
        </Button>
        <Button type="button" size="sm" className="ml-auto" onClick={onInsert}>
          {inserting ? <Plus className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          {inserting ? 'Add to pathway' : 'View'}
        </Button>
      </div>
    </div>
  )
}

export default function RoadmapExploreBlocksClient({ orgslug, insertInto, targetBlock }: Props) {
  const router = useRouter()
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const inserting = Boolean(insertInto)
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<RoadmapBlock | null>(null)
  const [draft, setDraft] = useState<Draft>(defaultDraft)
  const [saving, setSaving] = useState(false)
  const { data: blocks = [], isLoading, mutate } = useSWR(
    orgId && accessToken ? ['roadmap-block-explore', orgId, accessToken] : null,
    ([, currentOrgId, token]) => getRoadmapBlocks(currentOrgId, token),
    { revalidateOnFocus: false }
  )

  const insertBlock = async (block: RoadmapBlock) => {
    if (!orgId || !accessToken || !insertInto) {
      setSelected(block)
      return
    }
    const loading = toast.loading('Adding block')
    try {
      if (targetBlock) {
        await updateRoadmapPathwayBlock(orgId, targetBlock, { block_uuid: block.block_uuid, title_override: null, description_override: null }, accessToken)
      } else {
        await createRoadmapPathwayBlock(orgId, insertInto, { block_uuid: block.block_uuid, start_date: `${new Date().getFullYear()}-01` }, accessToken)
      }
      toast.success('Block added', { id: loading })
      router.push(getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(insertInto)))
    } catch {
      toast.error('Could not add block', { id: loading })
    }
  }

  const saveCustom = async () => {
    if (!orgId || !accessToken) return
    if (!draft.title.trim()) {
      toast.error('Block title is required')
      return
    }
    setSaving(true)
    const loading = toast.loading('Saving block')
    try {
      const block = await createRoadmapBlock(orgId, {
        title: draft.title,
        description: draft.description || null,
        lane_category: draft.lane_category,
        block_type: draft.block_type,
        starred: true,
        is_draft: false,
        skill_fit_score: num(draft.skill_fit_score),
        lifestyle_fit_score: num(draft.lifestyle_fit_score),
        confidence_score: num(draft.confidence_score),
        target_annual_income: num(draft.target_annual_income),
        expected_annual_income_low: num(draft.expected_annual_income_low),
        expected_annual_income_mid: num(draft.expected_annual_income_mid),
        expected_annual_income_high: num(draft.expected_annual_income_high),
        default_monthly_income: num(draft.default_monthly_income),
        default_monthly_expense: num(draft.default_monthly_expense),
        default_one_time_cost: num(draft.default_one_time_cost),
        notes: draft.notes || null,
      }, accessToken)
      await mutate([block, ...blocks], { revalidate: false })
      setCreateOpen(false)
      setDraft(defaultDraft)
      toast.success('Block saved', { id: loading })
      if (inserting) await insertBlock(block)
      else setSelected(block)
    } catch {
      toast.error('Could not save block', { id: loading })
    } finally {
      setSaving(false)
    }
  }

  const starred = blocks.filter((block) => block.starred)

  return (
    <GeneralWrapperStyled>
      <Breadcrumbs items={[
        { label: 'Journey', href: getUriWithOrg(orgslug, routePaths.org.journey()), icon: <Route size={14} /> },
        { label: 'Roadmap', href: getUriWithOrg(orgslug, routePaths.org.journeyRoadmap()) },
        { label: 'Explore' },
      ]} />
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={insertInto ? getUriWithOrg(orgslug, routePaths.org.journeyRoadmapOption(insertInto)) : getUriWithOrg(orgslug, routePaths.org.journeyRoadmap())} className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-800"><ArrowLeft className="mr-2 h-4 w-4" />Build workspace</Link>
          <h1 className="mt-2 text-3xl font-semibold text-gray-950">{inserting ? 'Choose a Block' : 'Explore Blocks'}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">Save reusable careers, degrees, jobs, certificates, finances, and life events for roadmap timelines.</p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Create custom</Button>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-950">Starred blocks</h2>
        {isLoading ? <div className="mt-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div> : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {starred.map((block) => (
              <BlockCard
                key={block.block_uuid}
                block={block}
                inserting={inserting}
                onOpen={() => setSelected(block)}
                onInsert={() => insertBlock(block)}
                onToggleStar={async () => {
                  if (!orgId || !accessToken || !block.editable) return
                  const updated = await updateRoadmapBlock(orgId, block.block_uuid, { starred: !block.starred }, accessToken)
                  await mutate(blocks.map((item) => item.block_uuid === updated.block_uuid ? updated : item), { revalidate: false })
                }}
              />
            ))}
            {!starred.length ? <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm text-gray-500 md:col-span-2 xl:col-span-3">No starred blocks yet.</div> : null}
          </div>
        )}
      </section>

      <section className="mt-10 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-950">Discover</h2>
        <p className="mt-2 text-sm text-gray-500">Recommended block discovery is coming soon. For now, create your own custom block.</p>
        <Button type="button" className="mt-4" onClick={() => setCreateOpen(true)}>Create custom</Button>
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Create custom block</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>Title</Label><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></div>
            <div className="space-y-2"><Label>Type</Label><Select value={draft.block_type} onValueChange={(value) => setDraft({ ...draft, block_type: value as RoadmapBlockType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Lane</Label><Select value={draft.lane_category} onValueChange={(value) => setDraft({ ...draft, lane_category: value as RoadmapBlockCategory })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="work">Work</SelectItem><SelectItem value="education">Education</SelectItem><SelectItem value="life">Life</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Target income</Label><Input type="number" value={draft.target_annual_income} onChange={(event) => setDraft({ ...draft, target_annual_income: event.target.value })} /></div>
            <div className="space-y-2"><Label>Skill fit</Label><Input type="number" min={1} max={10} value={draft.skill_fit_score} onChange={(event) => setDraft({ ...draft, skill_fit_score: event.target.value })} /></div>
            <div className="space-y-2"><Label>Lifestyle fit</Label><Input type="number" min={1} max={10} value={draft.lifestyle_fit_score} onChange={(event) => setDraft({ ...draft, lifestyle_fit_score: event.target.value })} /></div>
            <div className="space-y-2"><Label>Confidence</Label><Input type="number" min={1} max={10} value={draft.confidence_score} onChange={(event) => setDraft({ ...draft, confidence_score: event.target.value })} /></div>
            <div className="space-y-2"><Label>Mid income</Label><Input type="number" value={draft.expected_annual_income_mid} onChange={(event) => setDraft({ ...draft, expected_annual_income_mid: event.target.value })} /></div>
            <div className="space-y-2"><Label>Income/mo</Label><Input type="number" value={draft.default_monthly_income} onChange={(event) => setDraft({ ...draft, default_monthly_income: event.target.value })} /></div>
            <div className="space-y-2"><Label>Expense/mo</Label><Input type="number" value={draft.default_monthly_expense} onChange={(event) => setDraft({ ...draft, default_monthly_expense: event.target.value })} /></div>
            <div className="space-y-2"><Label>One-time cost</Label><Input type="number" value={draft.default_one_time_cost} onChange={(event) => setDraft({ ...draft, default_one_time_cost: event.target.value })} /></div>
            <div className="space-y-2"><Label>Income low</Label><Input type="number" value={draft.expected_annual_income_low} onChange={(event) => setDraft({ ...draft, expected_annual_income_low: event.target.value })} /></div>
            <div className="space-y-2"><Label>Income high</Label><Input type="number" value={draft.expected_annual_income_high} onChange={(event) => setDraft({ ...draft, expected_annual_income_high: event.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Description</Label><Textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Notes</Label><Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></div>
          </div>
          <Button type="button" onClick={saveCustom} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{inserting ? 'Save and add to pathway' : 'Save block'}</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          {selected ? (
            <>
              <DialogHeader><DialogTitle>{selected.title}</DialogTitle></DialogHeader>
              <p className="text-sm text-gray-500">{selected.description || 'Custom roadmap block'}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-gray-50 p-3">Skill fit <strong>{selected.skill_fit_score ?? '-'}/10</strong></div>
                <div className="rounded-lg bg-gray-50 p-3">Lifestyle <strong>{selected.lifestyle_fit_score ?? '-'}/10</strong></div>
                <div className="rounded-lg bg-gray-50 p-3">Mid income <strong>{money(selected.expected_annual_income_mid)}</strong></div>
              </div>
              <div className="mt-5 flex justify-end">
                <Button type="button" onClick={() => insertBlock(selected)}>{inserting ? 'Add to pathway' : 'Close'}</Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </GeneralWrapperStyled>
  )
}
