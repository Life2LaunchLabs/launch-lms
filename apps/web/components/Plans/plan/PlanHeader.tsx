'use client'

import React from 'react'
import { AlertTriangle, ChevronDown, History, Layers3, Lock, MoreVertical, Settings2 } from 'lucide-react'
import { SafeImage } from '@components/Objects/SafeImage'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { TemplateEditing } from '@components/Plans/editor/useTemplate'
import { versionLabel } from './planVersions'

type Props = {
  editing: TemplateEditing
  editMode: boolean
  /** "By <org>": who made the live version. */
  byName: string
  canSwitchLive: boolean
  onOpenVersions: () => void
  onOpenSettings: (() => void) | null
  /** The globe chip (who can find the live version), when the viewer may see it. */
  visibility?: React.ReactNode
  /** The collections row. */
  collections?: React.ReactNode
  /** Another organization's plan: why it can't be edited here. */
  note?: React.ReactNode
}

/** Title and description, then who made the live version, the live version chip and visibility; collections below. */
export default function PlanHeader({ editing, editMode, byName, canSwitchLive, onOpenVersions, onOpenSettings, visibility, collections, note }: Props) {
  const template = editing.template!
  const live = template.live_version
  const hadVersions = !!template.versions?.length
  const shown = editMode ? template.document.template : (template.live_document || template.document).template
  return <header className="space-y-4">
    <div className="flex items-start gap-4">
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-violet-100 text-violet-700 sm:h-20 sm:w-20">
        {template.thumbnail_image ? <SafeImage src={template.thumbnail_image} alt="" className="h-full w-full object-cover" /> : <Layers3 size={30} aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        {editMode ? <EditableText editing={editing} field="title" value={shown.title} className="text-3xl font-black tracking-tight sm:text-4xl" />
          : <h1 className="break-words text-3xl font-black tracking-tight text-foreground sm:text-4xl">{shown.title}</h1>}
        {editMode ? <EditableText editing={editing} field="description" value={shown.description || ''} placeholder="What learners will work toward" className="mt-1 text-base text-muted-foreground" />
          : shown.description ? <p className="mt-1 text-base text-muted-foreground">{shown.description}</p> : null}
      </div>
      {onOpenSettings ? <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" aria-label="Plan settings" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card hover:bg-muted"><MoreVertical size={17} /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onOpenSettings}><Settings2 />Settings</DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenVersions}><History />Versions</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu> : null}
    </div>
    <div className="flex flex-wrap items-center gap-2 sm:pl-24">
      <span className="text-sm font-bold">By {byName}</span>
      <button type="button" onClick={onOpenVersions} data-testid="live-version-chip"
        className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-bold', live ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
        {live ? <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" /> : null}
        {live ? versionLabel(live) : hadVersions ? 'Inactive' : 'Not published'}
        {canSwitchLive ? <ChevronDown size={14} aria-hidden="true" /> : <Lock size={12} aria-label="Locked" />}
      </button>
      {visibility}
    </div>
    {collections ? <div className="flex flex-wrap items-center gap-2 sm:pl-24">{collections}</div> : null}
    {!live && hadVersions ? <Banner>This plan is inactive. Nobody can be assigned or start it until a version is live.{canSwitchLive ? <button type="button" onClick={onOpenVersions} className="ml-2 font-black underline">Pick a version</button> : null}</Banner> : null}
    {note ? <Banner>{note}</Banner> : null}
  </header>
}

function Banner({ children }: { children: React.ReactNode }) {
  return <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><p>{children}</p></div>
}

/** A title or description edited in place while drafting; saved to the draft on blur, Enter in the title. */
function EditableText({ editing, field, value, placeholder, className }: { editing: TemplateEditing; field: 'title' | 'description'; value: string; placeholder?: string; className?: string }) {
  const [text, setText] = React.useState(value)
  React.useEffect(() => setText(value), [value])
  const save = () => {
    const next = text.trim()
    if (next === value || (field === 'title' && !next)) { setText(value); return }
    void editing.save((document) => ({ ...document, template: { ...document.template, [field]: next } }))
  }
  return <textarea aria-label={field === 'title' ? 'Plan title' : 'Plan description'} value={text} placeholder={placeholder} rows={1} maxLength={field === 'title' ? 200 : 2000}
    onChange={(event) => setText(event.target.value)} onBlur={save}
    onKeyDown={(event) => { if (event.key === 'Enter' && (field === 'title' || !event.shiftKey)) { event.preventDefault(); event.currentTarget.blur() } if (event.key === 'Escape') { setText(value); event.currentTarget.blur() } }}
    className={cn('block w-full resize-none rounded-lg border border-dashed border-transparent bg-transparent px-1 -mx-1 outline-none [field-sizing:content] hover:border-border focus:border-border focus:bg-card', className)} />
}
