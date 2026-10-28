'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ChevronUp, Clock3, Copy, FileText, GripVertical, ListChecks, Loader2, MoreVertical, Paperclip, Pencil, Play, Repeat2, Settings2, Trash2, UserRound } from 'lucide-react'
import type { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd'
import MaterialsEditor from '@components/Goals/edit/MaterialsEditor'
import { newStepDraft, type StepDraft } from '@components/Goals/edit/StepEditor'
import { STEP_TYPE_ORDER, stepDefinition } from '@components/Goals/steps'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { Switch } from '@components/ui/switch'
import StepRequirementLinks, { type RequirementFramework } from '@components/Plans/editor/StepRequirementLinks'
import { smallPrimaryClass } from '@components/Plans/shared/actions'
import { templatesApi } from '@services/goals/templates'
import type { StepTypeKey } from '@services/goals/types'
import { cn } from '@/lib/utils'
import PlanDialog from './PlanDialog'
import { plural } from './planVersions'

/** A step open on the plan page: what's typed, kept here until it saves (a new step saves once it has a title). */
export type OpenStep = { key: string; draft: StepDraft; links: string[]; isNew: boolean; activityUuid: string }

type Props = {
  value: OpenStep
  onChange: (value: OpenStep) => void // eslint-disable-line no-unused-vars
  onClose: () => void
  onDuplicate: () => void
  onDelete: () => void
  onOpenActivity: () => void
  activityHref: string
  orgId: number
  token?: string
  templateUuid: string
  frameworks: RequirementFramework[]
  planLinked: Set<string>
  others: Array<{ id: string; title: string }>
  saving: boolean
  autoFocus: boolean
  dragHandle?: DraggableProvidedDragHandleProps | null
  /** Why it can't save yet, if it can't. */
  problem: string | null
  /** The length of the step's stage, which due weeks count within; set here when it has none. */
  stageWeeks: number | null
  onStageWeeks: (weeks: number | null) => void // eslint-disable-line no-unused-vars
}

const chipClass = 'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-2 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-[15px]'
const chipOn = 'border-brand/30 bg-brand-soft text-brand-ink hover:bg-brand-soft'

/** Grows a textarea to fit what's in it. */
function grow(element: HTMLTextAreaElement | null) {
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

/**
 * One step edited where it sits in the plan: title and type up top, the learner's instructions and
 * what the type needs in the body, and the rest as chips along the bottom. Enter on the title saves
 * and closes; Esc closes.
 */
export default function InlineStep({ value, onChange, onClose, onDuplicate, onDelete, onOpenActivity, activityHref, orgId, token, templateUuid, frameworks, planLinked, others, saving, autoFocus, dragHandle, problem, stageWeeks, onStageWeeks }: Props) {
  const { draft, links } = value
  const definition = stepDefinition(draft.type)
  const Icon = definition.icon
  const ConfigPanel = definition.ConfigPanel as React.ComponentType<any> | undefined
  const SettingsPanel = definition.SettingsPanel as React.ComponentType<any> | undefined
  const set = (patch: Partial<StepDraft>) => onChange({ ...value, draft: { ...draft, ...patch } })
  const [shown, setShown] = React.useState(() => ({ materials: !!draft.materials?.length, staff: !!(draft.staff_guide || draft.staff_materials?.length), settings: false, due: false }))
  const [reqsOpen, setReqsOpen] = React.useState(false)
  const instructions = React.useRef<HTMLTextAreaElement>(null)
  React.useLayoutEffect(() => grow(instructions.current), [draft.description])
  const reviewable = !definition.finishesItself && draft.completed_by === 'learner'
  const isActivity = draft.type === 'activity'
  const changeTypes = STEP_TYPE_ORDER.filter((type) => type !== draft.type && (type !== 'activity' || value.isNew))
  const changeType = (type: StepTypeKey) => onChange({ ...value, draft: { ...draft, type, config: stepDefinition(type).defaultConfig() as StepDraft['config'], review_required: stepDefinition(type).finishesItself ? false : draft.review_required } })

  return <div data-inline-step={value.key} className="rounded-2xl border-[1.5px] border-brand/50 bg-card shadow-[0_1px_2px_hsl(200_30%_10%/.06),0_12px_32px_hsl(200_30%_10%/.1)]"
    onKeyDown={(event) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); onClose() } }}>
    <div className="grid grid-cols-[18px_40px_minmax(0,1fr)_auto] items-center gap-3 py-3 pl-2 pr-2">
      {dragHandle ? <span {...dragHandle} aria-hidden="true" className="grid place-items-center text-muted-foreground opacity-25"><GripVertical size={14} /></span> : <span aria-hidden="true" />}
      <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: definition.color }}><Icon size={20} aria-hidden="true" /></span>
      <span className="min-w-0">
        <input value={draft.title} onChange={(event) => set({ title: event.target.value })} placeholder={`e.g. ${definition.example}`} aria-label="Step title" autoFocus={autoFocus}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onClose() } }}
          className="block w-full border-0 bg-transparent p-0 text-[15px] font-bold outline-none placeholder:font-semibold placeholder:text-muted-foreground/55" />
        <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">{definition.label}{isActivity ? ' · plays in the app' : ''}{saving ? ' · Saving…' : ''}</span>
      </span>
      <span className="flex items-center">
      <button type="button" onClick={onClose} title="Close (Esc)" aria-label="Close step" className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronUp size={18} /></button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" aria-label="Step options" className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><MoreVertical size={18} /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          {isActivity ? null : <DropdownMenuItem onSelect={onDuplicate} disabled={!draft.title.trim()}><Copy />Duplicate</DropdownMenuItem>}
          {changeTypes.length ? <DropdownMenuSub>
            <DropdownMenuSubTrigger><Repeat2 className="mr-2 size-4" />Change type</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[320px] overflow-y-auto">
              {changeTypes.map((type) => { const other = stepDefinition(type); const OtherIcon = other.icon; return <DropdownMenuItem key={type} onSelect={() => changeType(type)}>
                <i className="grid h-5 w-5 place-items-center rounded-md text-white" style={{ background: other.color }}><OtherIcon size={12} /></i>{other.label}
              </DropdownMenuItem> })}
            </DropdownMenuSubContent>
          </DropdownMenuSub> : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} className="text-red-600"><Trash2 />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </span>
    </div>

    <div className="flex flex-col gap-3.5 px-4 pb-3 sm:pl-[72px]">
      <textarea ref={instructions} rows={1} value={draft.description} onChange={(event) => set({ description: event.target.value })} placeholder="Instructions for the learner (optional)" aria-label="Instructions for the learner"
        className="w-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60" />
      {isActivity ? <ActivityPages orgId={orgId} token={token} templateUuid={templateUuid} activityUuid={value.activityUuid} href={activityHref} onOpen={onOpenActivity} saving={saving} />
        : ConfigPanel ? <ConfigPanel config={draft.config} onChange={(config: StepDraft['config']) => set({ config })} orgId={orgId} token={token} personal={false} /> : null}
      {shown.materials ? <Section title="Materials" detail="Files and links learners open">
        <MaterialsEditor id={`step-materials-${value.key}`} value={draft.materials || []} onChange={(materials) => set({ materials })} orgId={orgId} token={token} addLabel="Add a file or link" />
      </Section> : null}
      {shown.staff ? <Section title="Staff guide" detail="Only staff see this">
        <textarea rows={3} value={draft.staff_guide || ''} onChange={(event) => set({ staff_guide: event.target.value })} placeholder="How to run this step: the lesson plan, timing, what to prepare" aria-label="Staff guide"
          className="w-full rounded-[10px] border border-border bg-background px-2.5 py-2 font-mono text-[13px] outline-none focus:border-brand" />
        <MaterialsEditor id={`step-staff-${value.key}`} value={draft.staff_materials || []} onChange={(staff_materials) => set({ staff_materials })} orgId={orgId} token={token} addLabel="Add for staff" />
      </Section> : null}
      {draft.review_required || draft.completed_by === 'staff' ? <Section title="Notes for reviewers">
        <input value={draft.reviewer_guidance} onChange={(event) => set({ reviewer_guidance: event.target.value })} placeholder="What a good one looks like" aria-label="Notes for reviewers"
          className="w-full border-0 border-b border-border bg-transparent pb-1 text-sm outline-none focus:border-brand" />
      </Section> : null}
      {shown.settings ? <Section title="Settings">
        {SettingsPanel ? <SettingsPanel config={draft.config} onChange={(config: StepDraft['config']) => set({ config })} orgId={orgId} token={token} personal={false} /> : null}
        {definition.finishesItself ? null : <div className="flex flex-col gap-1.5"><span className="text-[13px] font-bold">Who marks it done</span>
          <div className="inline-flex flex-wrap gap-0.5 self-start rounded-xl bg-muted p-[3px]">
            {(['learner', 'staff'] as const).map((person) => <button key={person} type="button" aria-pressed={draft.completed_by === person} onClick={() => set({ completed_by: person, review_required: person === 'staff' ? false : draft.review_required })}
              className={cn('rounded-[9px] px-3 py-[7px] text-[13px] font-semibold', draft.completed_by === person ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{person === 'learner' ? 'The learner' : 'Staff, like a meeting'}</button>)}
          </div></div>}
        {others.length ? <div className="flex flex-col gap-1.5"><span className="text-[13px] font-bold">Starts after</span><div className="flex flex-wrap gap-1.5">
          {others.map((other) => { const on = draft.after.includes(other.id); return <button key={other.id} type="button" aria-pressed={on} onClick={() => set({ after: on ? draft.after.filter((id) => id !== other.id) : [...draft.after, other.id] })}
            className={cn('max-w-[16rem] truncate rounded-[10px] border-2 px-2.5 py-1 text-xs font-bold', on ? 'border-brand bg-brand-soft text-brand-ink' : 'border-border text-muted-foreground')}>{other.title || 'Untitled step'}</button> })}
        </div></div> : null}
      </Section> : null}
      {problem ? <p role="status" className="text-xs font-semibold text-amber-700 dark:text-amber-400">{problem}</p> : null}
    </div>

    <div className="flex flex-wrap items-center gap-0.5 border-t border-border px-2 py-1.5">
      {frameworks.length ? <button type="button" className={cn(chipClass, links.length && chipOn)} onClick={() => setReqsOpen(true)}><ListChecks />Requirements{links.length ? <span className="rounded-full bg-brand px-1.5 text-[11px] text-white">{links.length}</span> : null}</button> : null}
      {shown.materials ? null : <button type="button" className={chipClass} onClick={() => setShown((current) => ({ ...current, materials: true }))}><Paperclip />Materials</button>}
      {shown.staff ? null : <button type="button" className={chipClass} onClick={() => setShown((current) => ({ ...current, staff: true }))}><FileText />Staff guide</button>}
      {shown.due ? <DueChip week={draft.due_week ?? null} stageWeeks={stageWeeks} onWeek={(due_week) => set({ due_week })} onStageWeeks={onStageWeeks} onDone={() => setShown((current) => ({ ...current, due: false }))} />
        : <button type="button" className={cn(chipClass, draft.due_week && chipOn)} onClick={() => setShown((current) => ({ ...current, due: true }))}><Clock3 />{draft.due_week ? `Week ${draft.due_week}` : 'Due'}</button>}
      {reviewable ? <label className={cn(chipClass, 'cursor-pointer', draft.review_required && chipOn)}>
        <Switch checked={draft.review_required} onCheckedChange={(checked) => set({ review_required: checked })} aria-label="Review before it counts" className="h-4 w-7 data-[state=checked]:bg-emerald-600 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3" />Review
      </label> : draft.completed_by === 'staff' ? <span className={cn(chipClass, chipOn)}><UserRound />Done by staff</span> : null}
      <button type="button" className={cn(chipClass, shown.settings && chipOn)} onClick={() => setShown((current) => ({ ...current, settings: !current.settings }))}><Settings2 />Settings</button>
    </div>

    <PlanDialog open={reqsOpen} onOpenChange={setReqsOpen} title="Requirements this step counts toward" size="md"
      footer={<><span className="mr-auto text-[13px] text-muted-foreground">{plural(links.length, 'requirement')} linked</span><button type="button" className={smallPrimaryClass + ' h-10 px-4 text-sm'} onClick={() => setReqsOpen(false)}>Done</button></>}>
      <StepRequirementLinks value={links} onChange={(next) => onChange({ ...value, links: next })} frameworks={frameworks} planLinked={planLinked} />
    </PlanDialog>
  </div>
}

/**
 * The due week, counted within the step's stage. A stage with no length gets one here too, since a due
 * week needs it. Leaving both fields closes the chip.
 */
function DueChip({ week, stageWeeks, onWeek, onStageWeeks, onDone }: { week: number | null; stageWeeks: number | null; onWeek: (week: number | null) => void; onStageWeeks: (weeks: number | null) => void; onDone: () => void }) { // eslint-disable-line no-unused-vars
  const [length, setLength] = React.useState(stageWeeks ? String(stageWeeks) : '')
  const number = (text: string) => text ? Math.max(1, Number(text)) : null
  const keys = (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); onDone() } }
  const saveLength = () => { const weeks = number(length); if (weeks !== stageWeeks) onStageWeeks(weeks) }
  const field = 'w-9 border-0 border-b border-current/30 bg-transparent p-0 text-center text-[12.5px] font-bold outline-none'
  return <span className={cn(chipClass, chipOn, 'gap-1')} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { saveLength(); onDone() } }}>
    <Clock3 />Week<input type="number" min={1} max={stageWeeks || undefined} autoFocus value={week ?? ''} aria-label="Due in week" onChange={(event) => onWeek(number(event.target.value))} onKeyDown={keys} className={field} />
    of<input type="number" min={1} value={length} aria-label="Stage length in weeks" onChange={(event) => setLength(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveLength(); keys(event) }} className={field} />weeks
  </span>
}

function Section({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-2">
    <span className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted-foreground">{title}{detail ? <span className="ml-1.5 font-semibold normal-case tracking-normal">· {detail}</span> : null}</span>
    {children}
  </section>
}

type ActivityPage = { page_uuid: string; page_type?: string; title?: string; content?: unknown }

/** What a page mostly is, for its thumbnail: a video, a question, or reading. */
function pageKind(page: ActivityPage): 'video' | 'question' | 'text' {
  if (page.page_type === 'video') return 'video'
  return JSON.stringify(page.content || {}).includes('"type":"question"') ? 'question' : 'text'
}

/** An activity step's pages as a strip, with Edit pages above it. A new activity opens the editor once it's saved. */
function ActivityPages({ orgId, token, templateUuid, activityUuid, href, onOpen, saving }: { orgId: number; token?: string; templateUuid: string; activityUuid: string; href: string; onOpen: () => void; saving: boolean }) {
  const { data, isLoading, error } = useSWR(activityUuid && token ? ['plan-activity-pages', orgId, templateUuid, activityUuid] : null, () => templatesApi.activity(orgId, templateUuid, activityUuid, token), { revalidateOnFocus: false })
  const pages: ActivityPage[] = data?.activity?.pages || []
  if (!activityUuid) return <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-dashed border-border px-3.5 py-3">
    <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">Write its pages in the activity editor. Back brings you here.</span>
    <button type="button" className={smallPrimaryClass} onClick={onOpen} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Pencil />}Open the editor</button>
  </div>
  return <div className="flex flex-col gap-2">
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] font-semibold text-muted-foreground">{isLoading ? 'Loading pages…' : error ? 'Couldn’t load its pages' : pages.length ? plural(pages.length, 'page') : 'No pages yet'}</span>
      <Link href={href} className={smallPrimaryClass}><Pencil />Edit pages</Link>
    </div>
    {pages.length ? <Link href={href} aria-label="Edit pages" className="flex gap-2 overflow-x-auto pb-1">
      {pages.map((page, index) => { const kind = pageKind(page); return <span key={page.page_uuid || index} title={page.title || `Page ${index + 1}`}
        className="flex aspect-[16/10] w-[104px] shrink-0 flex-col justify-between rounded-[10px] border border-border bg-muted/60 p-2 transition-colors hover:border-brand">
        <span className={cn('grid h-6 w-6 place-items-center rounded-md text-[11px] font-black', kind === 'video' ? 'bg-foreground text-background' : kind === 'question' ? 'bg-brand text-white' : 'bg-card text-muted-foreground')}>
          {kind === 'video' ? <Play size={12} aria-hidden="true" /> : kind === 'question' ? '?' : 'Aa'}
        </span>
        <span className="truncate text-[11px] font-semibold text-muted-foreground">{index + 1}. {page.title || 'Untitled page'}</span>
      </span> })}
    </Link> : null}
  </div>
}

/** The step types in a row, shown where a step is being added. */
export function StepTypeRow({ onPick, onClose }: { onPick: (type: StepTypeKey) => void; onClose: () => void }) { // eslint-disable-line no-unused-vars
  const first = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => { first.current?.focus() }, [])
  return <div role="group" aria-label="Add a step" data-step-types="" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }}
    className="flex gap-1.5 overflow-x-auto rounded-2xl border-[1.5px] sm:flex-wrap sm:justify-center border-dashed border-brand/45 bg-brand-soft/50 p-2 motion-safe:animate-[plan-rise_.2s_both]">
    {STEP_TYPE_ORDER.map((type, index) => { const definition = stepDefinition(type); const Icon = definition.icon; return <button key={type} ref={index ? undefined : first} type="button" onClick={() => onPick(type)} title={definition.hint}
      className="flex w-[74px] shrink-0 flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-[11.5px] font-bold text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:bg-card focus-visible:text-foreground">
      <span className="grid h-9 w-9 place-items-center rounded-[10px] text-white" style={{ background: definition.color }}><Icon size={18} aria-hidden="true" /></span>{definition.label}
    </button> })}
  </div>
}

/** A fresh step of a type, ready to type into. */
export const freshStep = (key: string, type: StepTypeKey): OpenStep => ({ key, draft: newStepDraft(type), links: [], isNew: true, activityUuid: '' })

