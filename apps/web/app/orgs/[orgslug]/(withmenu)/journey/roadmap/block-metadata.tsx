'use client'

import { ReactNode, useEffect, useState } from 'react'
import { Loader2, Save, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Textarea } from '@components/ui/textarea'
import { RoadmapBlock, RoadmapBlockPayload, RoadmapBlockType, RoadmapCashflowDirection, RoadmapCashflowPeriod, RoadmapPathwayBlock, RoadmapPathwayBlockPayload } from '@services/roadmap/blocks'
import { cn } from '@/lib/utils'

type DefinitionDraft = {
  block_type: RoadmapBlockType
  title: string
  description: string
  skill_fit_score: string
  lifestyle_fit_score: string
  confidence_score: string
  cashflow_amount: string
  cashflow_direction: RoadmapCashflowDirection
  cashflow_period: RoadmapCashflowPeriod
  cashflow_stddev: string
}

type InstanceDraft = {
  start_date: string
  end_date: string
  is_ongoing: boolean
  notes: string
}

export const blockTypeLabels: Record<RoadmapBlockType, string> = {
  employment: 'Employment',
  learning: 'Learning',
  personal: 'Personal',
}

function field(value?: number | null) {
  return value === null || value === undefined ? '' : String(value)
}

function toNumber(value: string) {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function makeDefinitionDraft(block?: RoadmapBlock): DefinitionDraft {
  return {
    block_type: block?.block_type || 'personal',
    title: block?.title || '',
    description: block?.description || '',
    skill_fit_score: field(block?.skill_fit_score),
    lifestyle_fit_score: field(block?.lifestyle_fit_score),
    confidence_score: field(block?.confidence_score),
    cashflow_amount: field(block?.cashflow_amount ?? block?.expected_annual_income_mid ?? block?.default_monthly_income ?? block?.default_monthly_expense ?? block?.default_one_time_cost),
    cashflow_direction: block?.cashflow_direction || (block?.default_monthly_expense || block?.default_one_time_cost ? 'expense' : 'income'),
    cashflow_period: block?.cashflow_period || (block?.default_one_time_cost ? 'total' : block?.expected_annual_income_mid ? 'yearly' : 'monthly'),
    cashflow_stddev: field(block?.cashflow_stddev),
  }
}

export function makeInstanceDraft(item?: RoadmapPathwayBlock): InstanceDraft {
  const year = new Date().getFullYear()
  return {
    start_date: item?.start_date || `${year}-01`,
    end_date: item?.end_date || '',
    is_ongoing: item?.is_ongoing || false,
    notes: item?.notes || '',
  }
}

export function definitionPayload(draft: DefinitionDraft): RoadmapBlockPayload {
  return {
    block_type: draft.block_type,
    title: draft.title,
    description: draft.description || null,
    is_draft: false,
    skill_fit_score: toNumber(draft.skill_fit_score),
    lifestyle_fit_score: toNumber(draft.lifestyle_fit_score),
    confidence_score: toNumber(draft.confidence_score),
    cashflow_amount: toNumber(draft.cashflow_amount),
    cashflow_direction: draft.cashflow_amount.trim() ? draft.cashflow_direction : null,
    cashflow_period: draft.cashflow_amount.trim() ? draft.cashflow_period : null,
    cashflow_stddev: toNumber(draft.cashflow_stddev),
    starred: true,
  }
}

export function instancePayload(draft: InstanceDraft): RoadmapPathwayBlockPayload {
  return {
    start_date: draft.start_date,
    end_date: draft.is_ongoing ? null : draft.end_date || null,
    is_ongoing: draft.is_ongoing,
    title_override: null,
    description_override: null,
    monthly_income_override: null,
    monthly_expense_override: null,
    one_time_cost_override: null,
    notes: draft.notes || null,
  }
}

function ScoreSlider({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <span className="text-xs font-semibold text-gray-500">{value || '-'}/10</span>
      </div>
      <input disabled={disabled} type="range" min={1} max={10} value={value || '5'} onChange={(event) => onChange(event.target.value)} className="w-full accent-gray-950" />
    </div>
  )
}

export function CashflowBellChart({ block }: { block: RoadmapBlock }) {
  const amount = block.cashflow_amount ?? block.expected_annual_income_mid ?? block.default_monthly_income ?? block.default_monthly_expense ?? block.default_one_time_cost
  const stddev = block.cashflow_stddev || (amount ? Math.abs(amount) * 0.15 : null)
  if (!amount) return <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">No cashflow estimate yet.</div>

  const sigma = Math.max(1, Math.abs(stddev || 1))
  const min = Math.floor((amount - sigma * 3) / 5000) * 5000
  const max = Math.ceil((amount + sigma * 3) / 5000) * 5000
  const points = []
  for (let value = min; value <= max; value += 5000) {
    const density = Math.exp(-0.5 * Math.pow((value - amount) / sigma, 2))
    points.push({ value, density })
  }
  const peak = Math.max(...points.map((point) => point.density))
  const width = 360
  const height = 140
  const leftPad = 16
  const rightPad = 16
  const topPad = 16
  const baseY = 108
  const xFor = (value: number) => leftPad + ((value - min) / Math.max(1, max - min)) * (width - leftPad - rightPad)
  const yFor = (density: number) => baseY - (density / peak) * (baseY - topPad)
  const line = points.map((point) => `${xFor(point.value)},${yFor(point.density)}`).join(' ')
  const area = `${leftPad},${baseY} ${line} ${width - rightPad},${baseY}`
  const low = amount - sigma
  const high = amount + sigma

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full">
        <polyline points={area} fill="rgba(17,24,39,0.08)" stroke="none" />
        <polyline points={line} fill="none" stroke="rgb(17 24 39)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {[low, amount, high].map((value) => (
          <line key={value} x1={xFor(value)} y1={topPad} x2={xFor(value)} y2={baseY + 5} stroke="rgba(17,24,39,0.28)" strokeDasharray={value === amount ? '0' : '4 5'} />
        ))}
        {points.map((point) => (
          <line key={point.value} x1={xFor(point.value)} y1={baseY} x2={xFor(point.value)} y2={baseY + 5} stroke="rgba(17,24,39,0.18)" />
        ))}
        <line x1={leftPad} y1={baseY} x2={width - rightPad} y2={baseY} stroke="rgba(17,24,39,0.2)" />
      </svg>
      <div className="grid grid-cols-3 gap-2 text-center text-xs font-medium text-gray-500">
        <span>-1 SD {formatMoney(low)}</span>
        <span>Mean {formatMoney(amount)}</span>
        <span>+1 SD {formatMoney(high)}</span>
      </div>
    </div>
  )
}

export function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return 'Not set'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function BlockMetadataSummary({ block }: { block: RoadmapBlock }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">{blockTypeLabels[block.block_type] || 'Personal'}</div>
        <h3 className="mt-1 text-lg font-semibold text-gray-950">{block.title || 'Untitled block'}</h3>
        {block.description ? <p className="mt-2 text-sm leading-6 text-gray-600">{block.description}</p> : null}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-lg bg-gray-50 p-2"><div className="font-semibold">{block.skill_fit_score ?? '-'}</div><div className="text-xs text-gray-500">Skill</div></div>
        <div className="rounded-lg bg-gray-50 p-2"><div className="font-semibold">{block.lifestyle_fit_score ?? '-'}</div><div className="text-xs text-gray-500">Lifestyle</div></div>
        <div className="rounded-lg bg-gray-50 p-2"><div className="font-semibold">{block.confidence_score ?? '-'}</div><div className="text-xs text-gray-500">Confidence</div></div>
      </div>
      <CashflowBellChart block={block} />
    </div>
  )
}

export function BlockMetadataEditor({
  block,
  instance,
  saving,
  onSave,
  onDelete,
  actions,
  children,
  className,
}: {
  block?: RoadmapBlock
  instance?: RoadmapPathwayBlock
  saving?: boolean
  onSave: (definition: RoadmapBlockPayload, placement?: RoadmapPathwayBlockPayload) => Promise<void>
  onDelete?: () => void
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const editableDefinition = Boolean(block?.editable)
  const [definition, setDefinition] = useState(() => makeDefinitionDraft(block))
  const [placement, setPlacement] = useState(() => makeInstanceDraft(instance))

  useEffect(() => {
    setDefinition(makeDefinitionDraft(block))
    setPlacement(makeInstanceDraft(instance))
  }, [block?.block_uuid, instance?.pathway_block_uuid])

  const handleSave = () => onSave(definitionPayload(definition), instance ? instancePayload(placement) : undefined)

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-white', className)}>
      <div className="shrink-0 border-b border-gray-100 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">{block ? blockTypeLabels[block.block_type] : 'Roadmap block'}</div>
          <h2 className="mt-1 truncate text-lg font-semibold text-gray-950">{block?.title || 'Block details'}</h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
          {onDelete ? <Button type="button" variant="outline" size="sm" className="text-red-600" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button> : null}
          {actions}
        </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <section className="space-y-4">
        <div className="space-y-2"><Label>Title</Label><Input disabled={!editableDefinition} value={definition.title} onChange={(event) => setDefinition({ ...definition, title: event.target.value })} /></div>
        <div className="space-y-2"><Label>Type</Label><Select disabled={!editableDefinition} value={definition.block_type} onValueChange={(value) => setDefinition({ ...definition, block_type: value as RoadmapBlockType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(blockTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Description</Label><Textarea disabled={!editableDefinition} value={definition.description} onChange={(event) => setDefinition({ ...definition, description: event.target.value })} /></div>
        <div className="grid grid-cols-3 gap-3">
          <ScoreSlider label="Skill" disabled={!editableDefinition} value={definition.skill_fit_score} onChange={(value) => setDefinition({ ...definition, skill_fit_score: value })} />
          <ScoreSlider label="Lifestyle" disabled={!editableDefinition} value={definition.lifestyle_fit_score} onChange={(value) => setDefinition({ ...definition, lifestyle_fit_score: value })} />
          <ScoreSlider label="Confidence" disabled={!editableDefinition} value={definition.confidence_score} onChange={(value) => setDefinition({ ...definition, confidence_score: value })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2"><Label>Dollar amount</Label><Input disabled={!editableDefinition} type="number" placeholder="0" value={definition.cashflow_amount} onChange={(event) => setDefinition({ ...definition, cashflow_amount: event.target.value })} /></div>
          <div className="space-y-2"><Label>Flow</Label><Select disabled={!editableDefinition} value={definition.cashflow_direction} onValueChange={(value) => setDefinition({ ...definition, cashflow_direction: value as RoadmapCashflowDirection })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="income">Income</SelectItem><SelectItem value="expense">Expense</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>Period</Label><Select disabled={!editableDefinition} value={definition.cashflow_period} onValueChange={(value) => setDefinition({ ...definition, cashflow_period: value as RoadmapCashflowPeriod })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="total">Total</SelectItem><SelectItem value="yearly">Yearly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select></div>
        </div>
        <div className="space-y-2"><Label>+/- dollars</Label><Input disabled={!editableDefinition} type="number" placeholder="0" value={definition.cashflow_stddev} onChange={(event) => setDefinition({ ...definition, cashflow_stddev: event.target.value })} /></div>
        {block ? <CashflowBellChart block={{ ...block, ...definitionPayload(definition) } as RoadmapBlock} /> : null}
      </section>

      {instance ? (
        <section className="space-y-4 border-t border-gray-200 pt-5">
          <h3 className="text-sm font-semibold text-gray-950">Timeline</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Start</Label><Input type="month" value={placement.start_date} onChange={(event) => setPlacement({ ...placement, start_date: event.target.value })} /></div>
            <div className="space-y-2"><Label>End</Label><Input type="month" disabled={placement.is_ongoing} value={placement.end_date} onChange={(event) => setPlacement({ ...placement, end_date: event.target.value })} /></div>
          </div>
          <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium">
            Ongoing
            <input type="checkbox" checked={placement.is_ongoing} onChange={(event) => setPlacement({ ...placement, is_ongoing: event.target.checked, end_date: event.target.checked ? '' : placement.end_date })} />
          </label>
          <div className="space-y-2"><Label>Note</Label><Textarea value={placement.notes} onChange={(event) => setPlacement({ ...placement, notes: event.target.value })} /></div>
        </section>
      ) : null}

      {children}
      </div>
    </div>
  )
}
