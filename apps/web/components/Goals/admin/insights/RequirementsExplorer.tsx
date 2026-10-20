'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import { ChevronRight, ClipboardCheck, Search } from 'lucide-react'
import { CreateFramework } from './RequirementFrameworkEditor'
import { stepDefinition } from '@components/Goals/steps'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { frameworksKey, requirementsApi, type Coverage } from '@services/goals/requirements'
import { cn } from '@/lib/utils'
import { EmptyState, PageLoader, Segmented, StatusPill } from '../live/ui'

const COLORS = ['#171717', '#2563EB']
const BOTH = `repeating-linear-gradient(135deg, ${COLORS[0]} 0 3px, ${COLORS[1]} 3px 6px)`
type Tally = { a: number; b: number; both: number; none: number; total: number }

/** A framework's requirements and which published goal templates cover each one, two templates at a time. */
export default function RequirementsExplorer({ orgslug, orgId, token }: { orgslug: string; orgId: number; token?: string }) {
  const router = useRouter()
  const listKey = orgId && token ? frameworksKey(orgId) : null
  const { data: frameworks, isLoading } = useSWR(listKey, () => requirementsApi.list(orgId, token), { revalidateOnFocus: false })
  const [frameworkUuid, setFrameworkUuid] = React.useState('')
  const selectedUuid = frameworkUuid || frameworks?.[0]?.framework_uuid || ''
  const { data: coverage, isLoading: coverageLoading } = useSWR(selectedUuid && token ? ['requirement-coverage', orgId, selectedUuid] : null, () => requirementsApi.coverage(orgId, selectedUuid, token), { revalidateOnFocus: false })
  if (isLoading) return <PageLoader />
  const refresh = () => listKey ? mutate(listKey) : Promise.resolve()
  const openFramework = (uuid: string) => router.push(getUriWithOrg(orgslug, routePaths.org.admin.requirementFramework(uuid, 'spec')))
  const create = <CreateFramework orgId={orgId} token={token} refresh={refresh} onCreated={openFramework} />
  if (!frameworks?.length) return <div className="px-10 pb-10 pt-6"><EmptyState icon={<ClipboardCheck size={36} />} title="No requirement frameworks yet" detail="Copy a published framework from the library (like your state’s graduation requirements) or write your own." /><div className="mt-4 flex justify-center">{create}</div></div>
  const framework = frameworks.find((item: any) => item.framework_uuid === selectedUuid) || frameworks[0]

  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white px-10 py-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        {frameworks.length > 1 ? <label className="min-w-0"><span className="sr-only">Framework</span><select value={selectedUuid} onChange={(event) => setFrameworkUuid(event.target.value)} className="max-w-[420px] truncate bg-transparent pr-2 text-lg font-black outline-none">{frameworks.map((item: any) => <option key={item.framework_uuid} value={item.framework_uuid}>{item.name}</option>)}</select></label> : <h2 className="text-lg font-black">{framework.name}</h2>}
        <StatusPill tone={framework.status === 'published' ? 'green' : 'amber'}>{framework.status}</StatusPill>
        <span className="text-xs text-gray-500">Version {framework.version}{framework.source_framework_uuid ? ' · from the library' : ''} · {framework.nodes?.length || 0} requirements · {framework.enrollment_count} learner{framework.enrollment_count === 1 ? '' : 's'}</span>
      </div>
      <div className="flex gap-2"><Link href={getUriWithOrg(orgslug, routePaths.org.admin.requirementFramework(framework.framework_uuid, 'details'))} className="inline-flex h-9 items-center rounded-full border border-gray-200 bg-white px-4 text-sm font-medium hover:bg-gray-50">Edit framework</Link>{create}</div>
    </div>
    {coverageLoading || !coverage ? <PageLoader /> : <Explorer key={selectedUuid} coverage={coverage} orgslug={orgslug} />}
  </div>
}

function Explorer({ coverage, orgslug }: { coverage: Coverage; orgslug: string }) {
  const nodes: any[] = React.useMemo(() => coverage.nodes || [], [coverage.nodes])
  const templates: any[] = React.useMemo(() => coverage.templates || [], [coverage.templates])
  const [selected, setSelected] = React.useState<string[]>(() => templates.filter((item) => item.mapped).slice(0, 2).map((item) => item.template_uuid))
  const [open, setOpen] = React.useState<Record<string, boolean>>(() => {
    const first = nodes.find((node) => !node.parent_node_uuid)
    return first ? { [first.node_uuid]: true } : {}
  })
  const [gapsOnly, setGapsOnly] = React.useState<'all' | 'gaps'>('all')
  const [query, setQuery] = React.useState('')
  const [active, setActive] = React.useState<string | null>(null)

  const children = React.useMemo(() => {
    const map = new Map<string | null, any[]>()
    nodes.forEach((node) => { const key = node.parent_node_uuid || null; map.set(key, [...(map.get(key) || []), node]) })
    map.forEach((list) => list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
    return map
  }, [nodes])
  const leavesUnder = React.useMemo(() => {
    const cache = new Map<string, any[]>()
    const walk = (node: any): any[] => {
      if (cache.has(node.node_uuid)) return cache.get(node.node_uuid)!
      const kids = children.get(node.node_uuid) || []
      const result = kids.length ? kids.flatMap(walk) : [node]
      cache.set(node.node_uuid, result)
      return result
    }
    nodes.forEach(walk)
    return cache
  }, [children, nodes])

  const covers = (node: any, templateUuid?: string) => Boolean(templateUuid) && (node.covered_by || []).some((item: any) => item.template_uuid === templateUuid)
  const classify = (node: any): keyof Omit<Tally, 'total'> => {
    const a = covers(node, selected[0]), b = covers(node, selected[1])
    return a && b ? 'both' : a ? 'a' : b ? 'b' : 'none'
  }
  const tally = (list: any[]): Tally => list.reduce((result, node) => { result[classify(node)] += 1; result.total += 1; return result }, { a: 0, b: 0, both: 0, none: 0, total: 0 })
  const allLeaves = nodes.filter((node) => !(children.get(node.node_uuid) || []).length)
  const totals = tally(allLeaves)
  const nameOf = (uuid?: string) => templates.find((item) => item.template_uuid === uuid)?.title || ''
  const toggleTemplate = (uuid: string) => setSelected((current) => current.includes(uuid) ? current.filter((item) => item !== uuid) : [...current, uuid].slice(-2))
  const activeNode = nodes.find((node) => node.node_uuid === active) || null
  const normalizedQuery = query.trim().toLowerCase()
  const matches = normalizedQuery ? allLeaves.filter((node) => `${node.code} ${node.title} ${node.description || ''}`.toLowerCase().includes(normalizedQuery)) : []

  const leafRow = (node: any, depth: number) => {
    const kind = classify(node)
    if (gapsOnly === 'gaps' && selected.length && kind !== 'none') return null
    return <button key={node.node_uuid} type="button" role="treeitem" aria-selected={active === node.node_uuid} onClick={() => setActive(node.node_uuid)} className={cn('flex min-h-10 w-full items-center gap-3 border-b border-gray-50 pr-4 text-left', active === node.node_uuid ? 'bg-blue-50 shadow-[inset_3px_0_0_#1d4ed8]' : 'bg-white hover:bg-gray-50')} style={{ paddingLeft: 16 + depth * 20 + 20 }}>
      <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"><span className="shrink-0 break-all text-xs font-bold text-gray-500">{node.code}</span><span className="min-w-0 break-words text-[13px] text-gray-900">{node.title}</span></span>
      <span className="flex max-w-24 shrink-0 flex-wrap gap-1 sm:w-[260px] sm:max-w-none">{selected.length ? kind === 'none' ? <StatusPill tone="amber">Not covered</StatusPill> : selected.filter((uuid) => covers(node, uuid)).map((uuid) => <span key={uuid} className="max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-bold text-white sm:max-w-[125px]" style={{ background: COLORS[selected.indexOf(uuid)] }}>{nameOf(uuid)}</span>) : <span className="text-xs text-gray-400">{(node.covered_by || []).length} step{(node.covered_by || []).length === 1 ? '' : 's'}</span>}</span>
    </button>
  }
  const renderNode = (node: any, depth: number): React.ReactNode => {
    const kids = children.get(node.node_uuid) || []
    if (!kids.length) return leafRow(node, depth)
    const t = tally(leavesUnder.get(node.node_uuid) || [])
    const isOpen = Boolean(open[node.node_uuid])
    if (gapsOnly === 'gaps' && selected.length && !t.none) return null
    return <React.Fragment key={node.node_uuid}>
      <div className={cn('flex min-h-11 items-center gap-3 border-b border-gray-50 pr-4', depth ? 'bg-white' : 'bg-gray-50/70')} style={{ paddingLeft: 16 + depth * 20 }}>
        <button type="button" role="treeitem" aria-selected={false} aria-expanded={isOpen} onClick={() => setOpen({ ...open, [node.node_uuid]: !isOpen })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronRight size={13} className={cn('shrink-0 text-gray-400 transition', isOpen && 'rotate-90')} />
          <span className="flex min-w-0 flex-1 flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-3"><span className="shrink-0 break-all text-xs font-black text-gray-500">{node.code}</span><span className={cn('min-w-0 break-words text-sm', depth ? 'font-semibold' : 'font-black')}>{node.title}</span></span>
        </button>
        <button type="button" onClick={() => setActive(node.node_uuid)} className="hidden w-[260px] shrink-0 items-center gap-3 sm:flex" aria-label={`Details for ${node.title}`}>
          {selected.length ? <><CoverageBar tally={t} /><span className="w-14 text-right text-xs text-gray-700">{t.total - t.none} / {t.total}</span><span className="w-16 text-right text-xs font-bold text-amber-700">{t.none ? `${t.none} gap${t.none === 1 ? '' : 's'}` : ''}</span></> : <span className="text-xs text-gray-500">{t.total} requirements</span>}
        </button>
      </div>
      {isOpen ? kids.map((kid) => renderNode(kid, depth + 1)) : null}
    </React.Fragment>
  }

  return <div className="flex flex-col xl:flex-row">
    <section aria-label="Framework" className="min-w-0 flex-1 space-y-3 px-10 pb-10 pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-gray-900">Coverage by</span>
        {templates.map((template) => { const index = selected.indexOf(template.template_uuid); return <button key={template.template_uuid} type="button" aria-pressed={index >= 0} onClick={() => toggleTemplate(template.template_uuid)} className={cn('inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold', index >= 0 ? 'border-black bg-white text-black shadow-[inset_0_0_0_1px_#000]' : 'border-gray-200 bg-gray-50 text-gray-600 hover:text-black')}><span className="h-2.5 w-2.5 rounded-sm" style={{ background: index >= 0 ? COLORS[index] : '#d1d5db' }} />{template.title}</button> })}
        {!templates.length ? <span className="text-xs text-gray-500">No goal templates yet.</span> : <span className="text-xs text-gray-500">Pick up to two</span>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-xs text-gray-700">
          {selected.length ? <>
            <Legend color={COLORS[0]} label={selected[1] ? `${nameOf(selected[0])} only` : nameOf(selected[0])} n={totals.a} />
            {selected[1] ? <><Legend color={BOTH} label="Both" n={totals.both} /><Legend color={COLORS[1]} label={`${nameOf(selected[1])} only`} n={totals.b} /></> : null}
            <Legend color="#f3f4f6" label="Not covered" n={totals.none} outline />
          </> : <span>{allLeaves.length} requirements. Pick a goal template to see what it covers.</span>}
        </div>
        <div className="flex items-center gap-2">
          <label className="relative flex items-center"><span className="sr-only">Search requirements</span><Search size={14} className="absolute left-2.5 text-gray-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${allLeaves.length} requirements`} className="h-9 w-56 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-[13px]" /></label>
          <Segmented<'all' | 'gaps'> label="Show" value={gapsOnly} onChange={setGapsOnly} options={[{ value: 'all', label: 'All' }, { value: 'gaps', label: 'Gaps only' }]} />
        </div>
      </div>
      <div role="tree" aria-label="Requirements" className="overflow-hidden rounded-xl border border-gray-100 bg-white nice-shadow">
        {normalizedQuery ? matches.length ? matches.map((node) => leafRow(node, 0)) : <p className="p-6 text-center text-sm text-gray-500">No requirement matches “{query}”.</p> : (children.get(null) || []).map((node) => renderNode(node, 0))}
      </div>
    </section>
    <aside aria-label="Requirement detail" className="border-t border-gray-100 bg-white p-6 xl:min-h-[calc(100vh-140px)] xl:w-[360px] xl:border-l xl:border-t-0">
      {activeNode ? <NodeDetail node={activeNode} nodes={nodes} templates={templates} orgslug={orgslug} leaves={leavesUnder.get(activeNode.node_uuid) || []} /> : <p className="text-sm text-gray-500">Select a requirement to see which steps meet it.</p>}
    </aside>
  </div>
}

function CoverageBar({ tally }: { tally: Tally }) {
  const width = (n: number) => `${tally.total ? (n / tally.total) * 100 : 0}%`
  return <span className="flex h-2 w-32 overflow-hidden rounded-full bg-gray-100" aria-hidden="true"><span style={{ width: width(tally.a), background: COLORS[0] }} /><span style={{ width: width(tally.both), background: BOTH }} /><span style={{ width: width(tally.b), background: COLORS[1] }} /></span>
}

function Legend({ color, label, n, outline }: { color: string; label: string; n: number; outline?: boolean }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn('h-3 w-3 rounded-sm', outline && 'border border-gray-300')} style={{ background: color }} />{label} <strong>{n}</strong></span>
}

function NodeDetail({ node, nodes, templates, orgslug, leaves }: { node: any; nodes: any[]; templates: any[]; orgslug: string; leaves: any[] }) {
  const path: any[] = []
  let parent = nodes.find((item) => item.node_uuid === node.parent_node_uuid)
  while (parent) { path.unshift(parent); parent = nodes.find((item) => item.node_uuid === parent.parent_node_uuid) }
  const isLeaf = leaves.length === 1 && leaves[0].node_uuid === node.node_uuid
  const byTemplate = templates.map((template) => ({ template, steps: (node.covered_by || []).filter((item: any) => item.template_uuid === template.template_uuid) }))
  const metadata = Object.entries(node.metadata || {}).filter(([, value]) => value !== '' && value !== null && value !== undefined)
  return <div className="space-y-5">
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{path.map((item) => item.title).join(' › ') || 'Top level'}</p>
      <p className="mt-2 text-xs font-black text-gray-500">{node.code}</p>
      <h2 className="text-lg font-black leading-snug text-gray-950">{node.title}</h2>
      {node.description ? <p className="mt-2 text-sm leading-6 text-gray-700">{node.description}</p> : null}
    </div>
    {metadata.length ? <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13px]">{metadata.map(([key, value]) => <React.Fragment key={key}><dt className="text-gray-500">{key}</dt><dd className="font-semibold text-gray-900">{String(value)}</dd></React.Fragment>)}</dl> : null}
    {isLeaf ? <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Covered by</p>
      {byTemplate.map(({ template, steps }) => <div key={template.template_uuid}>
        <Link href={getUriWithOrg(orgslug, routePaths.org.admin.template(template.template_uuid))} className="text-[13px] font-bold text-gray-900 hover:text-blue-700">{template.title}</Link>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{steps.length ? steps.map((step: any) => <StepChip key={step.step_key} step={step} />) : <span className="text-xs text-gray-400">Not covered</span>}</div>
      </div>)}
      <p className="text-xs leading-5 text-gray-500">Steps linked to the same requirement count as equivalent: a learner who misses one can do another. Link steps to requirements in a goal template’s steps.</p>
    </div> : <p className="text-sm text-gray-600">{leaves.length} requirements in this group. Open it to see each one.</p>}
  </div>
}

function StepChip({ step }: { step: { title: string; step_types: Array<Parameters<typeof stepDefinition>[0]> } }) {
  const Icon = stepDefinition(step.step_types[0] || 'task').icon
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-800"><Icon size={12} className="text-gray-500" aria-hidden="true" />{step.title}</span>
}
