'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Check, ChevronRight, Search } from 'lucide-react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { requirementsApi, type GroupRequirements } from '@services/goals/requirements'
import { cn } from '@/lib/utils'
import { EmptyState, Legend, PageLoader, personName, Segmented } from './ui'
import RequirementEvidenceExport from './RequirementEvidenceExport'

type Learner = GroupRequirements['learners'][number]

const LOOK: Record<string, { cls: string; label: string }> = {
  met: { cls: 'bg-green-100 text-green-700', label: '' },
  planned: { cls: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100', label: 'Planned' },
  gap: { cls: 'bg-amber-100 text-amber-800', label: 'Gap' },
}

type Node = { node_uuid: string; parent_node_uuid?: string | null; code?: string; title: string; position?: number }
type Category = { node: Node; leaves: Node[] }

/** Top-level categories, each with the requirements under it in tree order. A top-level requirement with nothing under it is its own category. */
function categoriesOf(nodes: Node[], leafIds: string[]): Category[] {
  const leaves = new Set(leafIds)
  const children = new Map<string, Node[]>()
  nodes.forEach((node) => { const parent = node.parent_node_uuid || ''; children.set(parent, [...(children.get(parent) || []), node]) })
  children.forEach((list) => list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
  const collect = (node: Node): Node[] => leaves.has(node.node_uuid) ? [node] : (children.get(node.node_uuid) || []).flatMap(collect)
  return (children.get('') || []).map((node) => ({ node, leaves: collect(node) })).filter((category) => category.leaves.length)
}

/** Learners × requirements for one group, one framework at a time: met, still in a goal, or a gap. */
export default function GroupRequirementsGrid({ orgslug, orgId, token, groupId }: { orgslug: string; orgId: number; token?: string; groupId: number }) {
  const [frameworkUuid, setFrameworkUuid] = React.useState<string | null>(null)
  const key = orgId && token ? ['group-requirements', orgId, groupId, frameworkUuid] : null
  const { data, isLoading } = useSWR(key, () => requirementsApi.group(orgId, groupId, frameworkUuid, token), { revalidateOnFocus: false, keepPreviousData: true })
  const [closed, setClosed] = React.useState<Record<string, boolean>>({})
  const [query, setQuery] = React.useState('')
  const [gapsOnly, setGapsOnly] = React.useState(false)
  const categories = React.useMemo(() => categoriesOf(data?.nodes || [], data?.leaf_node_uuids || []), [data])
  if (isLoading && !data) return <PageLoader />
  if (!data?.framework_uuid) return <EmptyState title="No requirements assigned to this group" detail="Assign a framework to the group from Goals › Requirements to track it here." />

  const all: Learner[] = data.learners || []
  const learners = all.filter((learner) => personName(learner).toLowerCase().includes(query.trim().toLowerCase()) && (!gapsOnly || learner.gaps > 0))
  const tracks = ['220px', ...categories.flatMap((category) => closed[category.node.node_uuid] ? ['112px'] : category.leaves.map(() => 'minmax(76px,150px)'))]
  const grid = { gridTemplateColumns: tracks.join(' ') }
  const minWidth = 220 + categories.reduce((sum, category) => sum + (closed[category.node.node_uuid] ? 112 : category.leaves.length * 80), 0)
  const metShare = (leaves: Node[], rows: Learner[]) => {
    const cells = rows.flatMap((learner) => leaves.map((leaf) => learner.cells?.[leaf.node_uuid]).filter(Boolean))
    return cells.length ? Math.round(cells.filter((cell) => cell === 'met').length * 100 / cells.length) : 0
  }
  const learnerHref = (learner: Learner) => getUriWithOrg(orgslug, routePaths.org.admin.people.userPage(learner.username || '', 'requirements'))

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3">
      {data.frameworks.length > 1 ? <Segmented<string> label="Framework" value={data.framework_uuid} onChange={(value: string) => setFrameworkUuid(value)} options={data.frameworks.map((item) => ({ value: item.framework_uuid, label: item.name }))} /> : <span className="text-sm font-black text-gray-900">{data.frameworks[0]?.name}</span>}
      <label className="relative flex items-center"><span className="sr-only">Search learners</span><Search size={14} className="absolute left-2.5 text-gray-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${all.length} learners`} className="h-9 w-56 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-[13px]" /></label>
      <label className="inline-flex items-center gap-2 text-[13px] font-semibold text-gray-700"><input type="checkbox" checked={gapsOnly} onChange={(event) => setGapsOnly(event.target.checked)} />Only learners with gaps</label>
      <span className="flex-1" />
      <RequirementEvidenceExport orgId={orgId} token={token} scope={{ usergroup_id: groupId, framework_uuid: data.framework_uuid, user_ids: learners.map((learner) => learner.id) }} />
      <span className="flex flex-wrap gap-3 text-xs text-gray-600"><Legend cls="bg-green-100" label="Met" /><Legend cls="bg-blue-50 ring-1 ring-blue-100" label="Planned" /><Legend cls="bg-amber-100" label="Gap" /></span>
    </div>
    <p className="text-xs text-gray-500">Planned means a step that counts is still open in one of the learner’s goals. Click a gap to add a make-up step or credit it on the learner’s page.{data.not_enrolled ? ` ${data.not_enrolled} member${data.not_enrolled === 1 ? ' isn’t' : 's aren’t'} on any framework yet.` : ''}</p>
    <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white nice-shadow">
      <div style={{ minWidth }}>
        <div className="grid gap-1 px-3 pt-2" style={grid}>
          <span />
          {categories.map((category, index) => {
            const isClosed = Boolean(closed[category.node.node_uuid])
            return <button key={category.node.node_uuid} type="button" aria-expanded={!isClosed} onClick={() => setClosed({ ...closed, [category.node.node_uuid]: !isClosed })} className={cn('flex min-w-0 items-center gap-1.5 rounded-t-lg px-2.5 py-2 text-left', index % 2 ? 'bg-gray-50' : 'bg-gray-100')} style={{ gridColumn: `span ${isClosed ? 1 : category.leaves.length}` }}>
              <ChevronRight size={12} className={cn('shrink-0 text-gray-500 transition', !isClosed && 'rotate-90')} />
              <span className="truncate text-xs font-black text-gray-900">{category.node.code ? `${category.node.code} ` : ''}{category.node.title}</span>
              {!isClosed ? <span className="shrink-0 text-[11px] text-gray-500">{metShare(category.leaves, all)}% met</span> : null}
            </button>
          })}
        </div>
        <div className="grid items-end gap-1 border-b border-gray-100 px-3 pb-2 pt-1" style={grid}>
          <span className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Learner</span>
          {categories.flatMap((category) => closed[category.node.node_uuid] ? [<span key={category.node.node_uuid} className="px-1.5 pb-1 text-[11px] text-gray-500">{metShare(category.leaves, all)}% met</span>] : category.leaves.map((leaf) => {
            const gaps = all.filter((learner) => learner.cells?.[leaf.node_uuid] === 'gap').length
            return <span key={leaf.node_uuid} title={leaf.title} className="flex min-h-14 min-w-0 flex-col gap-1 p-1.5">
              <span className="line-clamp-2 text-xs font-bold leading-tight text-gray-900">{leaf.code ? <span className="text-gray-500">{leaf.code} </span> : null}{leaf.title}</span>
              <span className={cn('text-[11px]', gaps ? 'font-semibold text-amber-700' : 'text-gray-500')}>{gaps ? `${gaps} gap${gaps === 1 ? '' : 's'}` : `${metShare([leaf], all)}% met`}</span>
            </span>
          }))}
        </div>
        {learners.map((learner) => <div key={learner.enrollment_uuid} className="grid items-center gap-1 border-b border-gray-50 px-3 py-1" style={grid}>
          <span className="flex min-w-0 items-center gap-2 pr-2">
            {learner.username ? <Link href={learnerHref(learner)} className="truncate text-[13px] font-bold text-gray-900 hover:text-blue-700">{personName(learner)}</Link> : <span className="truncate text-[13px] font-bold text-gray-700">{personName(learner)}</span>}
            <span className="shrink-0 text-[11px] text-gray-500">{learner.met}/{learner.total}</span>
          </span>
          {categories.flatMap((category) => {
            if (closed[category.node.node_uuid]) {
              const met = category.leaves.filter((leaf) => learner.cells?.[leaf.node_uuid] === 'met').length
              return [<span key={category.node.node_uuid} className={cn('flex h-9 items-center justify-center rounded-lg text-xs font-semibold', met === category.leaves.length ? 'bg-green-100 text-green-700' : 'bg-gray-50 text-gray-700')}>{met} of {category.leaves.length}</span>]
            }
            return category.leaves.map((leaf) => {
              const state = learner.cells?.[leaf.node_uuid]
              if (!state) return <span key={leaf.node_uuid} className="h-9 rounded-lg bg-gray-50" title="Not in this learner’s version of the framework" />
              const look = LOOK[state] || LOOK.gap
              const label = `${personName(learner)}, ${leaf.title}: ${state}`
              if (state === 'met' || !learner.username) return <span key={leaf.node_uuid} aria-label={label} className={cn('flex h-9 items-center justify-center rounded-lg text-[11px] font-bold', look.cls)}>{state === 'met' ? <Check size={14} strokeWidth={3} /> : look.label}</span>
              return <Link key={leaf.node_uuid} aria-label={label} href={learnerHref(learner)} className={cn('flex h-9 items-center justify-center rounded-lg text-[11px] font-bold hover:ring-2 hover:ring-gray-300', look.cls)}>{look.label}</Link>
            })
          })}
        </div>)}
        {!learners.length ? <p className="p-6 text-center text-sm text-gray-500">{gapsOnly ? 'No one in this group has a gap.' : 'No learners match.'}</p> : null}
      </div>
    </div>
  </div>
}
