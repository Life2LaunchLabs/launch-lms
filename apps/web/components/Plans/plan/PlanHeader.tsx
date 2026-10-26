'use client'

import React from 'react'
import Link from 'next/link'
import { Archive, BarChart3, ArchiveRestore, ChevronDown, Clock, Compass, Globe, History, ImageIcon, Info, Lock, MoreVertical, Settings2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { OrgMark, type OrgMarkSource } from '@components/Plans/shared/OrgMark'
import { PlanCover } from '@components/Plans/shared/PlanCover'
import { cn } from '@/lib/utils'
import type { TemplateEditing } from '@components/Plans/editor/useTemplate'
import { versionLabel } from './planVersions'

export type PlanMenu = {
  settings?: () => void
  versions?: () => void
  visibility?: () => void
  discover?: string | null
  /** The plan's Insights dashboards. */
  insights?: string | null
  archive?: { archived: boolean; run: () => void } | null
}

type Props = {
  editing: TemplateEditing
  editMode: boolean
  /** Who made the live version. */
  by: OrgMarkSource
  canSwitchLive: boolean
  /** The globe chip (who can find the live version), when the viewer may see it. */
  visibility?: React.ReactNode
  /** The collection chips. */
  collections?: React.ReactNode
  /** Another organization's plan: why it can't be edited here. */
  note?: React.ReactNode
  menu: PlanMenu
}

/** What's live: cover, title and description, then who made it, the live version and who can find it; collections under them. */
export default function PlanHeader({ editing, editMode, by, canSwitchLive, visibility, collections, note, menu }: Props) {
  const template = editing.template!
  const live = template.live_version
  const hadVersions = !!template.versions?.length
  const shown = editMode ? template.document.template : (template.live_document || template.document).template
  const VersionTag = canSwitchLive ? 'button' : 'span'
  const cover = <PlanCover plan={template} iconSize={34} className="h-[60px] w-[60px] shrink-0 rounded-2xl sm:h-[76px] sm:w-[76px] sm:rounded-[18px]">
    {editMode && menu.settings ? <span className="absolute -bottom-1.5 -right-1.5 grid h-[26px] w-[26px] place-items-center rounded-full border border-border bg-card text-foreground"><ImageIcon size={13} aria-hidden="true" /></span> : null}
  </PlanCover>
  return <header>
    <div className="flex items-start gap-3.5 sm:gap-[18px]">
      {editMode && menu.settings ? <button type="button" onClick={menu.settings} aria-label="Change the cover" className="relative shrink-0 overflow-visible rounded-[18px]">{cover}</button> : cover}
      <div className="min-w-0 flex-1">
        {editMode ? <EditableText editing={editing} field="title" value={shown.title} placeholder="Name your plan" className="text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.15] tracking-[-0.035em]" />
          : <h1 className="break-words text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.15] tracking-[-0.035em] text-foreground">{shown.title || 'Untitled plan'}</h1>}
        {editMode ? <EditableText editing={editing} field="description" value={shown.description || ''} placeholder="Add a short description learners will see" className="mt-1.5 text-base leading-normal text-muted-foreground focus:text-foreground" />
          : shown.description ? <p className="mt-1.5 text-base leading-normal text-muted-foreground">{shown.description}</p> : null}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex min-w-0 items-center gap-2 pr-1 text-[13px] font-semibold"><OrgMark org={by} className="h-[22px] w-[22px]" /><span className="truncate">By {by.name || 'another organization'}</span></span>
          <VersionTag {...(canSwitchLive ? { type: 'button' as const, onClick: menu.versions, title: 'Change the live version' } : {})} data-testid="live-version-chip"
            className={cn('inline-flex h-[30px] items-center gap-1.5 rounded-full pl-[9px] pr-2.5 text-[12.5px] font-bold',
              live ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground', canSwitchLive && 'hover:brightness-95')}>
            <span className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />
            {live ? versionLabel(live) : 'Inactive'}
            {!canSwitchLive && live ? <Lock size={12} className="opacity-60" aria-label="Locked" /> : canSwitchLive && (hadVersions || !live) ? <ChevronDown size={12} className="opacity-60" aria-hidden="true" /> : null}
          </VersionTag>
          {visibility}
        </div>
        {collections ? <div className="mt-2.5 flex flex-wrap gap-1.5">{collections}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {menu.insights ? <Link href={menu.insights} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-semibold hover:bg-muted">
          <BarChart3 size={16} aria-hidden="true" /><span className="hidden sm:inline">Insights</span><span className="sr-only sm:hidden">Insights</span></Link> : null}
        <MoreMenu menu={menu} />
      </div>
    </div>
    {!live ? <Note tone="warn" icon={<Clock size={17} aria-hidden="true" />}><b className="text-foreground">No live version.</b> {hadVersions ? 'You turned it off, so no one new can be assigned it.' : 'Publish your draft to start assigning it.'}
      {hadVersions && canSwitchLive ? <button type="button" onClick={menu.versions} className="ml-1.5 font-bold text-foreground underline underline-offset-2">Pick a version</button> : null}</Note> : null}
    {note ? <Note tone="info" icon={<Info size={17} aria-hidden="true" />}>{note}</Note> : null}
  </header>
}

function MoreMenu({ menu }: { menu: PlanMenu }) {
  const items = [menu.settings, menu.versions, menu.visibility, menu.discover, menu.archive].filter(Boolean)
  if (!items.length) return null
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button type="button" aria-label="More" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-card hover:bg-muted"><MoreVertical size={18} /></button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-52">
      {menu.settings ? <DropdownMenuItem onSelect={menu.settings}><Settings2 />Plan settings</DropdownMenuItem> : null}
      {menu.versions ? <DropdownMenuItem onSelect={menu.versions}><History />Live version</DropdownMenuItem> : null}
      {menu.visibility ? <DropdownMenuItem onSelect={menu.visibility}><Globe />Who can find it</DropdownMenuItem> : null}
      {menu.discover ? <DropdownMenuItem asChild><a href={menu.discover}><Compass />View in Discover</a></DropdownMenuItem> : null}
      {menu.archive ? <><DropdownMenuSeparator /><DropdownMenuItem onSelect={menu.archive.run}>{menu.archive.archived ? <><ArchiveRestore />Restore</> : <><Archive />Archive</>}</DropdownMenuItem></> : null}
    </DropdownMenuContent>
  </DropdownMenu>
}

function Note({ tone, icon, children }: { tone: 'info' | 'warn'; icon: React.ReactNode; children: React.ReactNode }) {
  return <div role="status" className={cn('mt-4 flex items-center gap-2.5 rounded-[14px] px-3.5 py-3 text-[13.5px] leading-[1.45]',
    tone === 'info' ? 'bg-brand-soft text-brand-ink' : 'bg-muted text-muted-foreground')}>
    <span className={cn('shrink-0', tone === 'info' ? 'text-brand' : '')}>{icon}</span><p className="min-w-0 flex-1">{children}</p>
  </div>
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
  return <textarea aria-label={field === 'title' ? 'Plan name' : 'Description'} value={text} placeholder={placeholder} rows={1} maxLength={field === 'title' ? 200 : 2000}
    onChange={(event) => setText(event.target.value)} onBlur={save}
    onKeyDown={(event) => { if (event.key === 'Enter' && (field === 'title' || !event.shiftKey)) { event.preventDefault(); event.currentTarget.blur() } if (event.key === 'Escape') { setText(value); event.currentTarget.blur() } }}
    className={cn('block w-full resize-none border-0 border-b-2 border-transparent bg-transparent p-0 outline-none [field-sizing:content] placeholder:text-muted-foreground/60 hover:border-border focus:border-brand', className)} />
}
