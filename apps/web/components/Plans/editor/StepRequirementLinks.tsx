'use client'

import React from 'react'
import useSWR from 'swr'
import { Check, ChevronDown } from 'lucide-react'
import { getAPIUrl } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { cn } from '@/lib/utils'

export interface RequirementNode { node_uuid: string; parent_node_uuid?: string | null; code?: string | null; title: string }
export interface RequirementFramework { framework_uuid: string; name: string; nodes?: RequirementNode[] }

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

const nodeLabel = (node: RequirementNode) => `${node.code ? `${node.code} · ` : ''}${node.title}`

/** What a template step counts toward: the requirement nodes it satisfies once done, picked into the step being edited. */
export default function StepRequirementLinks({ value, onChange, frameworks, readOnly = false }: { value: string[]; onChange: (nodes: string[]) => void; frameworks: RequirementFramework[]; readOnly?: boolean }) { // eslint-disable-line no-unused-vars
  const [open, setOpen] = React.useState(false)
  const byUuid = new Map(frameworks.flatMap((framework) => (framework.nodes || []).map((node) => [node.node_uuid, node] as const)))
  const toggle = (uuid: string) => onChange(value.includes(uuid) ? value.filter((item) => item !== uuid) : [...value, uuid])
  const summary = <span className="min-w-0"><span className="block text-[13px] font-bold">Counts toward</span>
    <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">{value.length ? value.map((uuid) => byUuid.get(uuid) ? nodeLabel(byUuid.get(uuid) as RequirementNode) : 'Requirement').join(', ') : 'No requirements linked'}</span></span>
  if (readOnly) return <div className="rounded-[14px] border border-border px-3.5 py-3">{summary}</div>
  return <div className="rounded-[14px] border border-border">
    <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left">
      {summary}
      <ChevronDown size={15} className={cn('shrink-0 transition-transform', open && 'rotate-180')} />
    </button>
    {open ? <div className="border-t border-border p-3.5">
      <p className="mb-3 text-xs text-muted-foreground">Finishing the step credits every selected requirement.</p>
      <div className="max-h-64 space-y-3 overflow-y-auto">
        {frameworks.map((framework) => <div key={framework.framework_uuid}>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-brand-ink">{framework.name}</p>
          {leafNodes(framework.nodes).map((node) => {
            const on = value.includes(node.node_uuid)
            return <label key={node.node_uuid} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted">
              <input type="checkbox" checked={on} onChange={() => toggle(node.node_uuid)} className="sr-only" />
              <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-brand bg-brand text-white' : 'border-border')}>{on ? <Check size={11} /> : null}</span>
              <span>{nodeLabel(node)}</span>
            </label>
          })}
        </div>)}
      </div>
    </div> : null}
  </div>
}
