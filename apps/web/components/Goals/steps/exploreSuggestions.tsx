'use client'

import React from 'react'
import { Library, Plus, X } from 'lucide-react'
import { Label } from '@components/ui/label'
import { ResourcePickerModal } from '@components/Resources/admin/ResourcePicker'
import type { ConfigPanelProps } from './registry'

/** Explore › Resources to start from: Library or org resources the board offers before the learner finds their own. */
export function ExploreSuggestions({ config, onChange, personal }: ConfigPanelProps<'explore'> & { personal?: boolean }) {
  const [picking, setPicking] = React.useState(false)
  const suggestions = config.suggestions || []
  if (personal) return null
  return <div className="flex flex-col gap-1.5">
    <Label>Resources to start from</Label>
    {suggestions.length ? <ul className="flex flex-wrap gap-1.5">{suggestions.map((item) => <li key={item.resource_uuid} className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background py-1 pl-2.5 pr-1 text-[13px] font-semibold">
      <Library size={13} aria-hidden="true" className="shrink-0 text-muted-foreground" /><span className="truncate">{item.title || 'Resource'}</span>
      <button type="button" aria-label={`Remove ${item.title || 'resource'}`} onClick={() => onChange({ ...config, suggestions: suggestions.filter((other) => other.resource_uuid !== item.resource_uuid) })}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={13} /></button>
    </li>)}</ul> : <p className="text-xs text-muted-foreground">The board starts empty. Add resources they can pin with one tap.</p>}
    <button type="button" onClick={() => setPicking(true)} className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold hover:bg-muted"><Plus size={14} aria-hidden="true" />Add resources</button>
    <ResourcePickerModal open={picking} setOpen={setPicking} title="Resources to start from" exclude={suggestions.map((item) => item.resource_uuid)}
      onPick={(rows) => onChange({ ...config, suggestions: [...suggestions, ...rows.map((row) => ({ resource_uuid: row.resource_uuid, title: row.title }))] })} />
  </div>
}
