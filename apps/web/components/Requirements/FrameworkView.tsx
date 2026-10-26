'use client'

import React from 'react'
import Link from 'next/link'
import { CaretDown, CaretRight, Check, Flag, MagnifyingGlass, Storefront, Target, X } from '@phosphor-icons/react'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { PlanCover } from '@components/Plans/shared/PlanCover'
import { Segmented } from '@components/Goals/admin/live/ui'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { Coverage, CoveragePlan, CoveringStep, FrameworkDetail, FrameworkField } from '@services/goals/requirements'
import {
  ancestorsOf, buildTree, gapIds, gaugeOf, isLeaf, kidsOf, leafState, needed, ruleOf, visibleRows,
  type TreeFilter, type TreeNode,
} from '@services/goals/requirementTree'
import { cn } from '@/lib/utils'
import { FlagMark, GaugeRing, PlanMarks, plural } from './Marks'

type Props = {
  framework: FrameworkDetail
  coverage: Coverage
  orgslug: string
  /** Staff can flag; null when the viewer can't. */
  onFlags: ((nodeUuids: string[]) => Promise<void>) | null // eslint-disable-line no-unused-vars
}

/**
 * A framework's requirements as a tree, filtered by the plans picked under "Covered by". Each group shows a ring of
 * what it needs and which plans cover it; each requirement, the plans covering it or an empty square. With no plans
 * picked, the tree is just the requirements. Gaps can be flagged, to fill from Discover or while editing a plan.
 */
export default function FrameworkView({ framework, coverage, orgslug, onFlags }: Props) {
  const tree = React.useMemo(() => buildTree(framework.nodes), [framework.nodes])
  const plans = React.useMemo(() => new Map(coverage.templates.map((plan) => [plan.template_uuid, plan])), [coverage.templates])
  const steps = React.useMemo(() => new Map(coverage.nodes.map((node) => [node.node_uuid, node.covered_by || []])), [coverage.nodes])
  const mapped = React.useMemo(() => coverage.templates.filter((plan) => plan.mapped), [coverage.templates])
  const [selected, setSelected] = React.useState<string[]>(() => mapped.map((plan) => plan.template_uuid))
  const [filter, setFilter] = React.useState<TreeFilter>('all')
  const [query, setQuery] = React.useState('')
  const [open, setOpen] = React.useState<Set<string>>(() => new Set(kidsOf(tree, null).map((node) => node.node_uuid)))
  const [active, setActive] = React.useState<string | null>(null)
  const flags = React.useMemo(() => new Set(framework.flagged_node_uuids || []), [framework.flagged_node_uuids])
  const [busy, setBusy] = React.useState(false)

  const showCoverage = selected.length > 0
  const coveredBy = React.useCallback((id: string) => {
    const covering = new Set((steps.get(id) || []).map((step) => step.template_uuid))
    return selected.filter((uuid) => covering.has(uuid))
  }, [steps, selected])
  const gaps = React.useMemo(() => new Set(showCoverage ? gapIds(tree, coveredBy) : []), [tree, coveredBy, showCoverage])
  const shownFilter: TreeFilter = filter === 'gaps' && !showCoverage ? 'all' : filter
  const rows = visibleRows(tree, { query, filter: shownFilter, open, flags, gaps })
  const unflagged = [...gaps].filter((id) => !flags.has(id))
  const activeNode = active ? tree.byId.get(active) || null : null

  const setFlags = async (next: string[]) => {
    if (!onFlags) return
    setBusy(true)
    try { await onFlags(next) } finally { setBusy(false) }
  }
  const toggleOpen = (id: string) => setOpen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const spareNote = (leaf: TreeNode) => {
    const parent = leaf.parent_node_uuid ? tree.byId.get(leaf.parent_node_uuid) : null
    return parent ? `Not covered, and not needed: ${parent.code || parent.title} needs ${needed(tree, parent)} of ${kidsOf(tree, parent.node_uuid).length}` : null
  }
  const mark = (node: TreeNode) => {
    if (!isLeaf(tree, node.node_uuid)) {
      return showCoverage ? <GaugeRing gauge={gaugeOf(tree, node, coveredBy)} plans={plans} /> : <span className="text-xs text-gray-500">{plural(countLeaves(tree, node), 'requirement')}</span>
    }
    const state = showCoverage ? leafState(node.node_uuid, coveredBy, gaps) : null
    return <span className="flex items-center gap-2">
      {flags.has(node.node_uuid) ? <FlagMark /> : null}
      {showCoverage ? <PlanMarks planUuids={coveredBy(node.node_uuid)} plans={plans} spareNote={state === 'spare' ? spareNote(node) : null} /> : null}
    </span>
  }

  const filterOptions: Array<{ value: TreeFilter; label: React.ReactNode }> = [
    { value: 'all', label: 'All' },
    ...(showCoverage ? [{ value: 'gaps' as const, label: <>Not covered · {gaps.size}</> }] : []),
    { value: 'flagged', label: <><Flag size={13} weight={flags.size ? 'fill' : 'regular'} aria-hidden="true" />Flagged · {flags.size}</> },
  ]

  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
    <section aria-label="Requirements" className="min-w-0 overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-3">
        <PlansPicker plans={coverage.templates} selected={selected} onChange={setSelected} />
        <Segmented label="Show" value={shownFilter} options={filterOptions} onChange={setFilter} />
        {onFlags && shownFilter === 'gaps' && unflagged.length ? <button type="button" disabled={busy} onClick={() => void setFlags([...flags, ...unflagged])} className={pill}><Flag size={14} aria-hidden="true" />Flag {plural(unflagged.length, 'gap')}</button> : null}
        {shownFilter === 'flagged' && flags.size ? <Link href={getUriWithOrg(orgslug, routePaths.org.admin.discoverCovering(framework.framework_uuid, [...flags]))} className={pill}><Storefront size={14} aria-hidden="true" />Find plans for them</Link> : null}
        {onFlags && shownFilter === 'flagged' && flags.size ? <button type="button" disabled={busy} onClick={() => void setFlags([])} className={pill}><X size={14} aria-hidden="true" />Clear all flags</button> : null}
        <label className="ml-auto flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-200 px-3 sm:max-w-[260px]">
          <MagnifyingGlass size={15} className="text-gray-400" aria-hidden="true" />
          <span className="sr-only">Find a requirement</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a requirement or code" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
      </div>
      <div role="tree" aria-label="Requirements">
        {rows.map(({ node, depth }) => {
          const leaf = isLeaf(tree, node.node_uuid)
          const expanded = !leaf && (open.has(node.node_uuid) || Boolean(query.trim()) || shownFilter !== 'all')
          return <div key={node.node_uuid} role="treeitem" aria-level={depth + 1} aria-expanded={leaf ? undefined : expanded} aria-selected={active === node.node_uuid}
            className={cn('flex min-h-11 items-center gap-2 border-b border-gray-50 pr-3', !depth ? 'bg-gray-50/70' : 'bg-white', active === node.node_uuid && 'bg-violet-50 shadow-[inset_3px_0_0_#7c3aed]')}
            style={{ paddingLeft: 8 + depth * 20 }}>
            <button type="button" tabIndex={-1} onClick={() => !leaf && toggleOpen(node.node_uuid)} aria-label={leaf ? undefined : expanded ? 'Collapse' : 'Expand'} className={cn('grid h-7 w-7 shrink-0 place-items-center rounded text-gray-400', leaf ? 'invisible' : 'hover:bg-gray-100')}>
              <CaretRight size={13} className={cn('transition', expanded && 'rotate-90')} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setActive(node.node_uuid)} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 text-left">
              {node.code ? <span className={cn('shrink-0 break-all text-xs', depth ? 'font-semibold text-gray-500' : 'rounded-md bg-gray-900 px-1.5 py-0.5 font-bold text-white')}>{node.code}</span> : null}
              <span className={cn('min-w-0 break-words text-[13.5px] text-gray-900', !leaf && (depth ? 'font-semibold' : 'font-bold'))}>{node.title}</span>
            </button>
            {mark(node)}
          </div>
        })}
        {!rows.length ? <p className="px-6 py-12 text-center text-sm text-gray-500">{
          !framework.nodes.length ? 'No requirements yet.'
            : shownFilter === 'flagged' ? 'Nothing flagged. Show what’s not covered, then flag the gaps you want to fill.'
            : shownFilter === 'gaps' ? 'Everything needed is covered by these plans.' : 'Nothing matches.'}</p> : null}
      </div>
    </section>
    <aside aria-label="Requirement details" className="self-start rounded-xl border border-gray-100 bg-white p-5 nice-shadow lg:sticky lg:top-4">
      {activeNode ? <Detail node={activeNode} tree={tree} framework={framework} plans={plans} steps={steps.get(activeNode.node_uuid) || []}
        selected={selected} coveredBy={coveredBy} gaps={gaps} flags={flags} showCoverage={showCoverage} orgslug={orgslug} busy={busy}
        onSelect={setActive} onFlag={onFlags ? (id, on) => void setFlags(on ? [...flags, id] : [...flags].filter((item) => item !== id)) : null} spareNote={spareNote} />
        : <p className="py-10 text-center text-sm text-gray-500">Pick a requirement to read it and see which plans cover it.</p>}
    </aside>
  </div>
}

const pill = 'inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-semibold text-gray-800 hover:border-gray-300 disabled:opacity-50'

function countLeaves(tree: ReturnType<typeof buildTree>, node: TreeNode): number {
  const kids = kidsOf(tree, node.node_uuid)
  return kids.length ? kids.reduce((sum, kid) => sum + countLeaves(tree, kid), 0) : 1
}

function PlansPicker({ plans, selected, onChange }: { plans: CoveragePlan[]; selected: string[]; onChange: (next: string[]) => void }) { // eslint-disable-line no-unused-vars
  const chosen = plans.filter((plan) => selected.includes(plan.template_uuid))
  const toggle = (uuid: string) => onChange(selected.includes(uuid) ? selected.filter((item) => item !== uuid) : plans.map((plan) => plan.template_uuid).filter((item) => item === uuid || selected.includes(item)))
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" className={pill} aria-haspopup="dialog">
        <span className="font-normal text-gray-500">Covered by</span>
        {chosen.length ? <span className="flex -space-x-1">{chosen.slice(0, 3).map((plan) => <PlanCover key={plan.template_uuid} plan={plan} className="h-4 w-4 rounded ring-2 ring-white" iconSize={10} />)}</span> : null}
        <span className="max-w-[160px] truncate">{chosen.length === 1 ? chosen[0].title : chosen.length ? `${chosen.length} plans` : 'No plans'}</span>
        <CaretDown size={12} aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[320px] p-2">
      <div className="flex items-center justify-between px-2 pb-2 pt-1 text-xs text-gray-500">
        <span>Your published plans</span>
        <span className="flex gap-3"><button type="button" className="font-semibold text-violet-700" onClick={() => onChange(plans.filter((plan) => plan.mapped).map((plan) => plan.template_uuid))}>Ones that count</button><button type="button" className="font-semibold text-violet-700" onClick={() => onChange([])}>None</button></span>
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        {plans.map((plan) => {
          const on = selected.includes(plan.template_uuid)
          return <button key={plan.template_uuid} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(plan.template_uuid)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-gray-50">
            <span className={cn('grid h-4 w-4 shrink-0 place-items-center rounded border', on ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-300')}>{on ? <Check size={11} weight="bold" aria-hidden="true" /> : null}</span>
            <PlanCover plan={plan} className="h-6 w-6 rounded-md" iconSize={13} />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{plan.title}</span>
            {!plan.mapped ? <span className="shrink-0 text-[11px] text-gray-400">No linked steps</span> : null}
          </button>
        })}
        {!plans.length ? <p className="px-2 py-4 text-sm text-gray-500">No published plans yet.</p> : null}
      </div>
    </PopoverContent>
  </Popover>
}

type DetailProps = {
  node: TreeNode; tree: ReturnType<typeof buildTree>; framework: FrameworkDetail; plans: Map<string, CoveragePlan>; steps: CoveringStep[]
  selected: string[]; coveredBy: (id: string) => string[]; gaps: Set<string>; flags: Set<string>; showCoverage: boolean; orgslug: string; busy: boolean // eslint-disable-line no-unused-vars
  onSelect: (id: string) => void; onFlag: ((id: string, on: boolean) => void) | null; spareNote: (leaf: TreeNode) => string | null // eslint-disable-line no-unused-vars
}

function Detail({ node, tree, framework, plans, steps, selected, coveredBy, gaps, flags, showCoverage, orgslug, busy, onSelect, onFlag, spareNote }: DetailProps) {
  const leaf = isLeaf(tree, node.node_uuid)
  const path = ancestorsOf(tree, node)
  const flagged = flags.has(node.node_uuid)
  const fields = (framework.source_metadata.fields || []).filter((field) => field.applies === 'all' || field.applies === (leaf ? 'requirements' : 'groups'))
  const values = fields.map((field) => [field, node.metadata?.[field.field_uuid]] as const).filter(([, value]) => value !== undefined && value !== null && value !== '')
  const head = <div className="space-y-2">
    <nav aria-label="Where it sits" className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
      {path.length ? path.map((item) => <React.Fragment key={item.node_uuid}><button type="button" onClick={() => onSelect(item.node_uuid)} className="font-semibold hover:text-gray-900">{item.code || item.title}</button><span aria-hidden="true">›</span></React.Fragment>) : <span>Category</span>}
      {path.length ? <span>{node.code || node.title}</span> : null}
    </nav>
    <div className="flex flex-wrap items-center gap-2">
      {node.code ? <span className={cn('text-sm font-bold', path.length ? 'text-gray-500' : 'rounded-md bg-gray-900 px-2 py-0.5 text-white')}>{node.code}</span> : null}
      {flagged ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"><Flag size={12} weight="fill" aria-hidden="true" />Flagged</span> : null}
    </div>
    <h2 className="text-lg font-bold leading-snug text-gray-900">{node.title}</h2>
    {node.description ? <p className="whitespace-pre-wrap text-sm text-gray-600">{node.description}</p> : null}
    {values.length ? <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pt-1 text-sm">{values.map(([field, value]) => <React.Fragment key={field.field_uuid}><dt className="text-gray-500">{field.name}</dt><dd className="min-w-0 break-words text-gray-900"><FieldValue field={field} value={value} /></dd></React.Fragment>)}</dl> : null}
  </div>

  if (leaf) {
    const shown = steps.filter((step) => selected.includes(step.template_uuid))
    const state = showCoverage ? leafState(node.node_uuid, coveredBy, gaps) : null
    const find = <Link href={getUriWithOrg(orgslug, routePaths.org.admin.discoverCovering(framework.framework_uuid, [node.node_uuid]))} className={pill}><Storefront size={14} aria-hidden="true" />Find a plan that covers it</Link>
    const flagButton = onFlag ? <button type="button" disabled={busy} onClick={() => onFlag(node.node_uuid, !flagged)} className={cn(pill, !flagged && 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300')}><Flag size={14} weight={flagged ? 'regular' : 'fill'} aria-hidden="true" />{flagged ? 'Unflag' : 'Flag as a gap'}</button> : null
    return <div className="space-y-5">{head}
      <section className="space-y-2 border-t border-gray-100 pt-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Covered by</h3>
        {!showCoverage ? <p className="text-sm text-gray-500">Pick plans under Covered by to see which ones count toward this.</p>
          : shown.length ? <ul className="space-y-2">{shown.map((step) => { const plan = plans.get(step.template_uuid); return <li key={`${step.template_uuid}:${step.step_key}`} className="flex items-center gap-2.5">{plan ? <PlanCover plan={plan} className="h-7 w-7 shrink-0 rounded-md" iconSize={14} /> : null}<span className="min-w-0"><b className="block text-sm font-semibold text-gray-900">{step.title}</b><small className="block truncate text-xs text-gray-500">{plan?.title}</small></span></li> })}</ul>
          : <p className="flex items-start gap-2 text-sm text-gray-600"><span className={cn('mt-0.5 inline-block h-4 w-4 shrink-0 rounded-[4px] border-2 border-gray-300', state === 'spare' && 'border-dashed')} aria-hidden="true" />{state === 'spare' ? spareNote(node) : 'Not covered by the selected plans.'}</p>}
        {state !== 'covered' || flagged ? <div className="flex flex-wrap gap-2 pt-1">{flagButton}{state !== 'covered' ? find : null}</div> : null}
        {onFlag && !flagged && state === 'gap' ? <p className="text-xs text-gray-500">Flagged gaps show up in Discover and on plans that count toward this framework, so you can fill them when you edit a plan.</p> : null}
      </section>
    </div>
  }

  const kids = kidsOf(tree, node.node_uuid)
  const rule = ruleOf(node)
  const gauge = gaugeOf(tree, node, coveredBy)
  return <div className="space-y-5">{head}
    <section className="space-y-3 border-t border-gray-100 pt-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Met when</h3>
      <p className="flex items-start gap-2 text-sm text-gray-700"><Target size={16} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" /><span>{rule.kind === 'any' ? `Any ${needed(tree, node)} of these ${kids.length} are met` : `All ${kids.length} of these are met`}.{showCoverage ? ` The selected plans cover ${gauge.got} of the ${gauge.need} needed.` : ''}</span></p>
      <ul className="divide-y divide-gray-50 rounded-lg border border-gray-100">
        {kids.map((kid) => <li key={kid.node_uuid}><button type="button" onClick={() => onSelect(kid.node_uuid)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50">
          <span className="min-w-0 flex-1 text-sm text-gray-900">{kid.code ? <span className="mr-1.5 text-xs font-semibold text-gray-500">{kid.code}</span> : null}{kid.title}</span>
          {showCoverage ? isLeaf(tree, kid.node_uuid) ? <PlanMarks planUuids={coveredBy(kid.node_uuid)} plans={plans} /> : <GaugeRing gauge={gaugeOf(tree, kid, coveredBy)} plans={plans} size={18} /> : null}
          {flags.has(kid.node_uuid) ? <FlagMark /> : null}
        </button></li>)}
      </ul>
    </section>
  </div>
}

function FieldValue({ field, value }: { field: FrameworkField; value: unknown }) {
  if (field.type === 'boolean') return <>{value ? 'Yes' : 'No'}</>
  if (field.type === 'link' && typeof value === 'string') return <a href={/^https?:\/\//.test(value) ? value : `https://${value}`} target="_blank" rel="noopener noreferrer" className="text-violet-700 underline underline-offset-2">{value}</a>
  return <>{String(value)}</>
}
