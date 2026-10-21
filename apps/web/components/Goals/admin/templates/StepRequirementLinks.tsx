'use client'

import React from 'react'
import useSWR from 'swr'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { getAPIUrl } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { cn } from '@/lib/utils'

export interface RequirementNode { node_uuid: string; parent_node_uuid?: string | null; code?: string | null; title: string }
export interface RequirementFramework { framework_uuid: string; name: string; nodes?: RequirementNode[] }

// Requirement frameworks keep their own endpoint; the same key as the Requirements tab, so the cache is shared.
export const requirementFrameworksKey = (orgId: number) => `${getAPIUrl()}planning/requirements?org_id=${orgId}`

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

/** What a template step counts toward: the requirement nodes it satisfies once done. */
export default function StepRequirementLinks({ value, frameworks, saving, onSave, readOnly = false }: { value: string[]; frameworks: RequirementFramework[]; saving: boolean; onSave: (nodes: string[]) => Promise<boolean>; readOnly?: boolean }) { // eslint-disable-line no-unused-vars
  const [open, setOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<string[]>(value)
  React.useEffect(() => setSelected(value), [value])
  const byUuid = new Map(frameworks.flatMap((framework) => (framework.nodes || []).map((node) => [node.node_uuid, node] as const)))
  const toggle = (uuid: string) => setSelected((current) => current.includes(uuid) ? current.filter((item) => item !== uuid) : [...current, uuid])
  const save = async () => { if (await onSave(selected)) setOpen(false) }
  const summary = <span><span className="block text-[10px] font-black uppercase tracking-wide text-muted-foreground">Counts toward</span>
    <span className="mt-0.5 block text-xs font-semibold">{value.length ? value.map((uuid) => byUuid.get(uuid) ? nodeLabel(byUuid.get(uuid) as RequirementNode) : 'Requirement').join(', ') : 'No requirements linked'}</span></span>
  // Read-only: what it counts toward, without the picker.
  if (readOnly) return <div className="rounded-lg border border-border bg-card px-4 py-3">{summary}</div>
  return <div className="rounded-lg border border-border bg-card">
    <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
      {summary}
      <ChevronDown size={15} className={open ? 'rotate-180' : ''} />
    </button>
    {open ? <div className="border-t border-border p-4">
      <p className="mb-3 text-xs text-muted-foreground">Finishing the step credits every selected requirement.</p>
      <div className="max-h-64 space-y-3 overflow-y-auto">
        {frameworks.map((framework) => <div key={framework.framework_uuid}>
          <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-blue-700">{framework.name}</p>
          {leafNodes(framework.nodes).map((node) => {
            const on = selected.includes(node.node_uuid)
            return <label key={node.node_uuid} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted">
              <input type="checkbox" checked={on} onChange={() => toggle(node.node_uuid)} className="sr-only" />
              <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300')}>{on ? <Check size={11} /> : null}</span>
              <span>{nodeLabel(node)}</span>
            </label>
          })}
        </div>)}
        {!frameworks.length ? <p className="text-xs text-muted-foreground">Create a requirement framework first.</p> : null}
      </div>
      <div className="mt-4 flex justify-end"><button type="button" onClick={() => void save()} disabled={saving} className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{saving ? <Loader2 className="animate-spin" size={13} /> : null}Save links</button></div>
    </div> : null}
  </div>
}
