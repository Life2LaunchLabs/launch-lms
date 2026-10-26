'use client'

import React from 'react'
import useSWR from 'swr'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, Search, Sparkles, Trash2, X } from 'lucide-react'
import {
  RANGE_LABELS, insightKeys, insightsApi, isCardError,
  type CardOutcome, type CardSpec, type DashboardCard, type DateRange, type LibraryQuestion, type Preset, type Registry, type Scope,
} from '@services/insights/insights'
import { cn } from '@/lib/utils'
import InsightCard from './InsightCard'
import { useInsightsContext } from './shared'

// Add or edit one card: pick a question from the library, or set what it shows piece by piece and watch the
// card redraw. Every choice maps to one field of the spec (services/insights/spec.py), so what the editor
// makes is what the API stores.

export const SIZES: Array<{ span: number; label: string }> = [{ span: 3, label: 'Small' }, { span: 6, label: 'Medium' }, { span: 8, label: 'Large' }, { span: 12, label: 'Wide' }]
const CHART_LABELS: Record<string, string> = { number: 'Number', line: 'Line', columns: 'Columns', bars: 'Bars', stacked: 'Stacked', heatmap: 'Heatmap', table: 'Table' }
const COMPARE: Array<{ key: 'prior' | 'year' | 'none'; label: string }> = [{ key: 'prior', label: 'Period before' }, { key: 'year', label: 'Last year' }, { key: 'none', label: 'Nothing' }]
const STATUS_FILTERS: Array<{ key: string; label: string; values: string[] | null }> = [
  { key: 'active', label: 'Active learners', values: null }, { key: 'alumni', label: 'Alumni', values: ['alumni'] }, { key: 'both', label: 'Both', values: ['active', 'alumni'] },
]

export type EditorTarget = { card: DashboardCard | null }
type Draft = { spec: CardSpec; span: number }

function useDebounced<T>(value: T, ms = 350): T {
  const [current, setCurrent] = React.useState(value)
  React.useEffect(() => { const timer = setTimeout(() => setCurrent(value), ms); return () => clearTimeout(timer) }, [value, ms])
  return current
}

const seg = (on: boolean) => cn('h-8 rounded-full px-3 text-[13px] font-semibold transition-colors', on ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')
const selectClass = 'h-9 w-full rounded-xl border border-border bg-card px-2.5 text-[13.5px] font-semibold text-foreground'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5 sm:grid-cols-[88px_1fr] sm:items-center">
    <span className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span><div className="min-w-0">{children}</div>
  </div>
}

function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<{ key: T; label: string; disabled?: boolean }>; onChange: (key: T) => void; label: string }) { // eslint-disable-line no-unused-vars
  return <div className="inline-flex flex-wrap rounded-full border border-border bg-card p-0.5" role="group" aria-label={label}>
    {options.map((option) => <button key={String(option.key)} type="button" disabled={option.disabled} onClick={() => onChange(option.key)} aria-pressed={value === option.key}
      className={cn(seg(value === option.key), 'disabled:opacity-40')}>{option.label}</button>)}
  </div>
}

/** The draft run as it would be on this dashboard, re-run a moment after each change. */
function usePreview(spec: CardSpec | null, scope: Scope, scopeKey: string | null, range: DateRange) {
  const { orgId, token, ready } = useInsightsContext()
  const debounced = useDebounced(spec)
  const { data } = useSWR(ready && debounced ? ['insights', orgId, 'preview', scope, scopeKey, JSON.stringify([debounced, range])] : null,
    () => insightsApi.run(orgId, { scope: { kind: scope, key: scopeKey }, range, cards: [{ key: 'preview', spec: debounced! }] }, token), { revalidateOnFocus: false, keepPreviousData: true })
  return data?.preview
}

function Library({ scope, onPick }: { scope: Scope; onPick: (question: LibraryQuestion) => void }) { // eslint-disable-line no-unused-vars
  const { orgId, token, ready } = useInsightsContext()
  const [query, setQuery] = React.useState('')
  const { data } = useSWR(ready ? insightKeys.library(orgId, scope) : null, () => insightsApi.library(orgId, scope, token), { revalidateOnFocus: false })
  const shown = (data?.questions || []).filter((item) => item.text.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="space-y-3">
    <label className="flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3"><Search size={15} className="text-muted-foreground" aria-hidden="true" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions" aria-label="Search questions" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
    </label>
    <ul className="space-y-1">
      {shown.map((item) => <li key={item.key}><button type="button" onClick={() => onPick(item)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] font-semibold hover:bg-muted">
        <Sparkles size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />{item.text}
      </button></li>)}
      {data && !shown.length ? <li className="px-2.5 py-3 text-[13px] text-muted-foreground">No questions match. Try a blank card.</li> : null}
    </ul>
    <p className="text-[12.5px] text-muted-foreground">Every question is an ordinary card. Pick one, then change anything about it.</p>
  </div>
}

/** What the card shows, field by field. */
function Fields({ draft, setSpec, setSpan, registry, scope, filterChoices }: {
  draft: Draft; setSpec: (patch: Partial<CardSpec>) => void; setSpan: (span: number) => void; registry: Registry; scope: Scope // eslint-disable-line no-unused-vars
  filterChoices: Record<string, Array<{ key: string; label: string }>>
}) {
  const { spec } = draft
  const measure = registry.measures.find((item) => item.key === spec.measure)
  const dimLabel = (key: string) => registry.dimensions.find((item) => item.key === key)?.label || key
  const dims = (measure?.dims || []).filter((key) => registry.dimensions.find((item) => item.key === key)?.available !== false)
  const second = spec.by && spec.by !== 'time' && !measure?.snapshot ? dims.filter((key) => key !== 'time' && key !== spec.by) : []
  const statusFilter = (spec.filters || []).find((item) => item.field === 'learner_status')
  const statusKey = !statusFilter ? 'active' : statusFilter.values.length > 1 ? 'both' : statusFilter.values[0] === 'alumni' ? 'alumni' : 'active'
  const objectFilters = (spec.filters || []).filter((item) => item.field !== 'learner_status')
  const setStatus = (key: string) => {
    const values = STATUS_FILTERS.find((item) => item.key === key)?.values
    setSpec({ filters: [...objectFilters, ...(values ? [{ field: 'learner_status', op: 'in' as const, values }] : [])] })
  }
  const filterable = dims.filter((key) => filterChoices[key]?.length)
  const setObjectFilter = (field: string, value: string) => {
    const others = (spec.filters || []).filter((item) => item.field !== field)
    setSpec({ filters: value ? [...others, { field, op: 'in', values: [value] }] : others })
  }
  const rangeValue = typeof spec.range === 'object' ? 'inherit' : spec.range || 'inherit'
  const compareValue = typeof spec.compare === 'object' ? 'prior' : spec.compare || 'prior'
  return <div className="space-y-3.5">
    <Row label="Show">
      <select aria-label="Show" className={selectClass} value={spec.measure} onChange={(event) => setSpec({ measure: event.target.value, by: null, by2: null, chart: 'auto', filters: (spec.filters || []).filter((item) => item.field === 'learner_status') })}>
        {registry.measures.map((item) => <option key={item.key} value={item.key} disabled={!item.available}>{item.label}{item.available ? '' : ' (needs See reports)'}</option>)}
      </select>
      {measure ? <p className="mt-1 text-[12px] text-muted-foreground">{measure.definition}</p> : null}
    </Row>
    <Row label="By">
      <div className="flex flex-wrap gap-2">
        <select aria-label="By" className={cn(selectClass, 'w-auto')} value={spec.by || ''} onChange={(event) => setSpec({ by: event.target.value || null, by2: null, chart: 'auto' })}>
          <option value="">{measure?.snapshot ? 'Its own split' : 'Nothing (one number)'}</option>
          {dims.map((key) => <option key={key} value={key}>{dimLabel(key)}</option>)}
        </select>
        {second.length ? <select aria-label="And by" className={cn(selectClass, 'w-auto')} value={spec.by2 || ''} onChange={(event) => setSpec({ by2: event.target.value || null, chart: 'auto' })}>
          <option value="">And by…</option>
          {second.map((key) => <option key={key} value={key}>and {dimLabel(key).toLowerCase()}</option>)}
        </select> : null}
      </div>
    </Row>
    <Row label="Who">
      <Segmented label="Who" value={statusKey} onChange={setStatus} options={STATUS_FILTERS.map(({ key, label }) => ({ key, label }))} />
      {filterable.length ? <div className="mt-2 flex flex-wrap gap-2">
        {filterable.map((field) => <select key={field} aria-label={`Only one ${dimLabel(field).toLowerCase()}`} className={cn(selectClass, 'w-auto')}
          value={objectFilters.find((item) => item.field === field)?.values[0] || ''} onChange={(event) => setObjectFilter(field, event.target.value)}>
          <option value="">Every {dimLabel(field).toLowerCase()}</option>
          {filterChoices[field].map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>)}
      </div> : null}
      {scope !== 'org' ? <p className="mt-1 text-[12px] text-muted-foreground">Always narrowed to the {scope} the dashboard shows.</p> : null}
    </Row>
    <Row label="Dates">
      <Segmented label="Dates" value={rangeValue} onChange={(key) => setSpec({ range: key as CardSpec['range'] })}
        options={[{ key: 'inherit', label: 'Dashboard’s' }, ...(Object.keys(RANGE_LABELS) as Preset[]).map((key) => ({ key, label: RANGE_LABELS[key] }))]} />
    </Row>
    {measure?.snapshot ? null : <Row label="Compare">
      <Segmented label="Compare" value={compareValue} onChange={(key) => setSpec({ compare: key })} options={COMPARE.map(({ key, label }) => ({ key, label }))} />
    </Row>}
    <Row label="Size"><Segmented label="Size" value={draft.span} onChange={setSpan} options={SIZES.map(({ span, label }) => ({ key: span, label }))} /></Row>
    <Row label="Headline">
      <Segmented label="Headline" value={spec.headline?.mode || 'auto'} onChange={(mode) => setSpec({ headline: { mode, text: spec.headline?.text || '' } })}
        options={[{ key: 'auto', label: 'Write it for me' }, { key: 'custom', label: 'My own' }]} />
      {spec.headline?.mode === 'custom' ? <input aria-label="Headline text" maxLength={200} value={spec.headline.text} onChange={(event) => setSpec({ headline: { mode: 'custom', text: event.target.value } })}
        className="mt-2 h-9 w-full rounded-xl border border-border bg-card px-3 text-sm" placeholder="What should this card say?" />
        : <p className="mt-1 text-[12px] text-muted-foreground">The headline follows the numbers, and only calls a change when it is real.</p>}
    </Row>
  </div>
}

/** Pick a chart once the card has run: only the charts its result can show. */
function ChartRow({ spec, setSpec, outcome }: { spec: CardSpec; setSpec: (patch: Partial<CardSpec>) => void; outcome: CardOutcome | undefined }) { // eslint-disable-line no-unused-vars
  if (!outcome || isCardError(outcome)) return null
  return <Row label="As">
    <Segmented label="Chart" value={spec.chart && spec.chart !== 'auto' ? spec.chart : 'auto'} onChange={(key) => setSpec({ chart: key as CardSpec['chart'] })}
      options={[{ key: 'auto', label: 'Best fit' }, ...outcome.charts.map((key) => ({ key, label: CHART_LABELS[key] }))]} />
  </Row>
}

/** The sheet: library or blank for a new card, the fields for an existing one, and the live preview above. */
export default function CardEditor({ target, onClose, onSave, onRemove, scope, scopeKey, range, filterChoices }: {
  target: EditorTarget | null; onClose: () => void; onSave: (card: DashboardCard) => void; onRemove: (key: string) => void // eslint-disable-line no-unused-vars
  scope: Scope; scopeKey: string | null; range: DateRange; filterChoices: Record<string, Array<{ key: string; label: string }>>
}) {
  const { orgId, token, ready } = useInsightsContext()
  const { data: registry } = useSWR(ready && target ? insightKeys.registry(orgId, scope, scopeKey) : null, () => insightsApi.registry(orgId, scope, scopeKey, token), { revalidateOnFocus: false })
  const [mode, setMode] = React.useState<'library' | 'fields'>('library')
  const [draft, setDraft] = React.useState<Draft | null>(null)
  React.useEffect(() => {
    if (!target) return
    setMode(target.card ? 'fields' : 'library')
    setDraft(target.card ? { spec: target.card.spec, span: target.card.span } : null)
  }, [target])
  const blank = () => {
    const first = registry?.measures.find((item) => item.available)
    setDraft({ spec: { measure: first?.key || 'active_learners' }, span: 6 })
    setMode('fields')
  }
  const outcome = usePreview(mode === 'fields' && draft ? draft.spec : null, scope, scopeKey, range)
  const setSpec = (patch: Partial<CardSpec>) => setDraft((current) => current && { ...current, spec: { ...current.spec, ...patch } })
  const save = () => {
    if (!draft) return
    const spec = { ...draft.spec }
    if (spec.headline?.mode !== 'custom') delete spec.headline
    onSave({ key: target?.card?.key || `card_${Math.random().toString(36).slice(2, 9)}`, span: draft.span, spec })
  }
  return <Dialog.Root open={Boolean(target)} onOpenChange={(open) => { if (!open) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
      <Dialog.Content className="insights-viz fixed inset-y-0 right-0 z-50 flex w-full max-w-[620px] flex-col border-l border-border bg-card shadow-2xl outline-none">
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <Dialog.Title className="text-[17px] font-bold tracking-tight">{target?.card ? 'Edit card' : 'Add a card'}</Dialog.Title>
            <Dialog.Description className="mt-0.5 text-[12.5px] text-muted-foreground">
              {scope === 'org' ? 'Counts the learners you can see.' : `Answers for whichever ${scope} the dashboard shows.`}
            </Dialog.Description>
          </div>
          <Dialog.Close className="rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close"><X size={18} /></Dialog.Close>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!target?.card ? <Segmented label="Start from" value={mode === 'library' ? 'library' : 'fields'} onChange={(key) => key === 'library' ? setMode('library') : draft ? setMode('fields') : blank()}
            options={[{ key: 'library', label: 'From the library' }, { key: 'fields', label: draft ? 'Your card' : 'Blank' }]} /> : null}
          {mode === 'library' ? <Library scope={scope} onPick={(question) => { setDraft({ spec: question.spec, span: 6 }); setMode('fields') }} />
            : draft && registry ? <>
              <div className="grid grid-cols-12 rounded-2xl bg-muted/60 p-3">
                <InsightCard card={{ key: 'preview', span: 12, spec: draft.spec }} outcome={outcome} drill={() => {}} linkFor={() => null} />
              </div>
              <Fields draft={draft} setSpec={setSpec} setSpan={(span) => setDraft({ ...draft, span })} registry={registry} scope={scope} filterChoices={filterChoices} />
              <ChartRow spec={draft.spec} setSpec={setSpec} outcome={outcome} />
            </> : <span className="block h-40 animate-pulse rounded-2xl bg-muted" />}
        </div>
        <footer className="flex items-center gap-2 border-t border-border px-5 py-3">
          {target?.card ? <button type="button" onClick={() => onRemove(target.card!.key)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-red-600 hover:bg-red-50">
            <Trash2 size={14} />Remove</button> : null}
          <span className="flex-1" />
          <Dialog.Close className="inline-flex h-9 items-center rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold hover:bg-muted">Cancel</Dialog.Close>
          <button type="button" onClick={save} disabled={!draft || mode === 'library'} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background disabled:opacity-50">
            <Check size={14} />{target?.card ? 'Save card' : 'Add card'}
          </button>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
