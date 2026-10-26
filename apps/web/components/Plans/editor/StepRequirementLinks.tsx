'use client'

import React from 'react'
import useSWR from 'swr'
import { Check, Flag, Plus, Search, X } from 'lucide-react'
import { getAPIUrl } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { cn } from '@/lib/utils'

export interface RequirementNode { node_uuid: string; parent_node_uuid?: string | null; code?: string | null; title: string; description?: string | null }
export interface RequirementFramework { framework_uuid: string; name: string; nodes?: RequirementNode[]; flagged_node_uuids?: string[] }

// Requirement frameworks keep their own endpoint; the same key as the Requirements tab, so the cache is shared.
export const requirementFrameworksKey = (orgId: number) => `${getAPIUrl()}requirement-frameworks?org_id=${orgId}`

export function useRequirementFrameworks(orgId: number, token?: string) {
  const { data } = useSWR<RequirementFramework[]>(orgId && token ? requirementFrameworksKey(orgId) : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: false })
  return Array.isArray(data) ? data : []
}

/** Steps link to leaf requirement nodes only. */
export function leafNodes(nodes: RequirementNode[] = []) {
  const parents = new Set(nodes.map((node) => node.parent_node_uuid).filter(Boolean))
  return nodes.filter((node) => !parents.has(node.node_uuid))
}

/** The codes of a node's parents, top first, for a short path like "SB3 › SB3.1". */
function pathOf(node: RequirementNode, byUuid: Map<string, RequirementNode>): string {
  const parts: string[] = []
  let parent = node.parent_node_uuid ? byUuid.get(node.parent_node_uuid) : undefined
  while (parent && parts.length < 8) { parts.unshift(parent.code || parent.title); parent = parent.parent_node_uuid ? byUuid.get(parent.parent_node_uuid) : undefined }
  return parts.join(' › ')
}

type Props = {
  value: string[]
  onChange: (nodes: string[]) => void // eslint-disable-line no-unused-vars
  frameworks: RequirementFramework[]
  readOnly?: boolean
  /** Requirements other steps in this plan already count toward, so flagged gaps they fill show as covered. */
  planLinked?: Set<string>
}

/**
 * What a template step counts toward, as chips with each requirement's full wording. Linking opens a picker
 * with the gaps staff flagged first, so they can be ticked off while writing the plan.
 */
export default function StepRequirementLinks({ value, onChange, frameworks, readOnly = false, planLinked }: Props) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const byUuid = React.useMemo(() => new Map(frameworks.flatMap((framework) => (framework.nodes || []).map((node) => [node.node_uuid, node] as const))), [frameworks])
  const flagged = React.useMemo(() => frameworks.flatMap((framework) => {
    const leaves = new Set(leafNodes(framework.nodes).map((node) => node.node_uuid))
    return (framework.flagged_node_uuids || []).filter((uuid) => leaves.has(uuid)).map((uuid) => byUuid.get(uuid)!).filter(Boolean)
  }), [frameworks, byUuid])
  const flaggedIds = new Set(flagged.map((node) => node.node_uuid))
  const frameworkOf = React.useMemo(() => new Map(frameworks.flatMap((framework) => (framework.nodes || []).map((node) => [node.node_uuid, framework.name] as const))), [frameworks])
  const toggle = (uuid: string) => onChange(value.includes(uuid) ? value.filter((item) => item !== uuid) : [...value, uuid])
  const needle = query.trim().toLowerCase()
  const matches = (node: RequirementNode) => !needle || `${node.code || ''} ${node.title} ${node.description || ''}`.toLowerCase().includes(needle)

  const chips = value.length ? <ul className="flex flex-col gap-1.5">
    {value.map((uuid) => {
      const node = byUuid.get(uuid)
      return <li key={uuid} className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2">
        <span className="min-w-0 flex-1 text-[13px] leading-snug">
          {node?.code ? <b className="mr-1.5 font-semibold text-muted-foreground">{node.code}</b> : null}
          <span>{node ? node.title : 'A requirement that is no longer in its framework'}</span>
        </span>
        {readOnly ? null : <button type="button" onClick={() => toggle(uuid)} className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground" aria-label={`Unlink ${node?.title || 'requirement'}`}><X size={13} /></button>}
      </li>
    })}
  </ul> : <p className="text-[13px] text-muted-foreground">No requirements linked.</p>

  const row = (node: RequirementNode, source?: string) => {
    const on = value.includes(node.node_uuid)
    const coveredElsewhere = !on && planLinked?.has(node.node_uuid)
    return <button key={node.node_uuid} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(node.node_uuid)} className={cn('flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted', on && 'bg-muted')}>
      <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-brand bg-brand text-white' : 'border-border')}>{on ? <Check size={11} /> : null}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-snug">{node.code ? <b className="mr-1.5 font-semibold text-muted-foreground">{node.code}</b> : null}{node.title}
          {flaggedIds.has(node.node_uuid) ? <span className={cn('ml-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-semibold', on || coveredElsewhere ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{on || coveredElsewhere ? <><Check size={10} />Covered</> : <><Flag size={10} />Flagged</>}</span> : null}</span>
        {node.description ? <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{node.description}</span> : null}
        {source || (!node.code && pathOf(node, byUuid)) ? <span className="mt-0.5 block text-[11px] text-muted-foreground">{[source, node.code ? '' : pathOf(node, byUuid)].filter(Boolean).join(' · ')}</span> : null}
      </span>
    </button>
  }

  return <div className="rounded-[14px] border border-border px-3.5 py-3">
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="text-[13px] font-bold">Counts toward</span>
      {readOnly ? null : <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-ink hover:underline">{open ? 'Done' : <><Plus size={13} />Link a requirement</>}</button>}
    </div>
    {chips}
    {open && !readOnly ? <div className="mt-3 border-t border-border pt-3">
      <label className="mb-2 flex h-9 items-center gap-2 rounded-lg border border-border px-2.5">
        <Search size={14} className="text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Find a requirement</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a requirement" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
      </label>
      <div className="max-h-72 space-y-3 overflow-y-auto">
        {flagged.filter(matches).length ? <div>
          <p className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-amber-700"><Flag size={11} />Flagged gaps</p>
          {flagged.filter(matches).map((node) => row(node, frameworks.length > 1 ? frameworkOf.get(node.node_uuid) : undefined))}
        </div> : null}
        {frameworks.map((framework) => {
          const rest = leafNodes(framework.nodes).filter((node) => !flaggedIds.has(node.node_uuid) && matches(node))
          return rest.length ? <div key={framework.framework_uuid}>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-brand-ink">{framework.name}</p>
            {rest.map((node) => row(node))}
          </div> : null
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Finishing the step credits every linked requirement.</p>
    </div> : null}
  </div>
}
