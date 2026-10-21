'use client'

import React from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Bell, Check, ClipboardCheck, FileText, Link2, Loader2, Play, ScrollText } from 'lucide-react'
import { Button } from '@components/ui/button'
import { EditorPreviewModal } from '@components/Learning/player/EditorPreviewModal'
import { getUriWithOrg } from '@services/config/config'
import { goalAdminApi, type AssignmentStatus, type MatrixColumn, type MatrixLearner } from '@services/goals/admin'
import { stepTodo } from '@services/goals/cohort'
import { cn } from '@/lib/utils'
import { personName, reviewHref } from '../live/ui'
import { shortDay } from './shared'

export type TodoContext = {
  orgslug: string
  orgId: number
  token?: string
  assignmentUuid: string
  status: AssignmentStatus
  learners: MatrixLearner[]
  /** Admins can try an activity: previews belong to whoever builds them. */
  admin: boolean
  now: Date
  /** Reload the matrix after reminding or settling. */
  refresh: () => unknown
}

/** A list of names: Noah and Aisha, or Noah, Aisha and 3 more. */
export function namesOf(uuids: string[], learners: MatrixLearner[], max = 3) {
  const names = uuids.map((uuid) => learners.find((learner) => learner.user_uuid === uuid)).filter(Boolean).map((learner) => personName(learner).split(' ')[0])
  if (!names.length) return ''
  const shown = names.slice(0, max)
  const rest = names.length - shown.length
  if (rest) return `${shown.join(', ')} and ${rest} more`
  return shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`
}

/** Where grading this step happens: activity answers by activity, hand-ins by step. */
function gradingHref(column: MatrixColumn, ctx: TodoContext) {
  const activity = column.type === 'activity' && column.aggregate.to_grade_count ? column.config?.activity_uuid : null
  return getUriWithOrg(ctx.orgslug, activity ? reviewHref({ assignment: ctx.assignmentUuid, activity, from: 'assignment' })
    : reviewHref({ assignment: ctx.assignmentUuid, stepKey: column.template_key, from: 'assignment' }))
}

/**
 * What's left for staff on one step of the plan. On a closed row: a line and its buttons (grade,
 * remind); on the open step, in place of its card: the same, settling a step staff confirm, and
 * for the step coming up, what to prepare.
 */
export default function StepTodos({ column, ctx, upcoming, full, onOpen }: { column: MatrixColumn; ctx: TodoContext; upcoming: boolean; full: boolean; onOpen: () => void }) {
  const todo = stepTodo(column, ctx.learners, ctx.now)
  const [reminding, setReminding] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const remind = async () => {
    setReminding(true)
    try {
      const result = await goalAdminApi.remind(ctx.orgId, ctx.assignmentUuid, column.template_key, { user_uuids: todo.remindable }, ctx.token)
      toast.success(result.reminded.length ? `Reminded ${result.reminded.length}. Each got a card in their feed.` : 'Nobody needed a reminder.')
      setSent(true)
      await ctx.refresh()
    } catch (error: any) { toast.error(error?.message || 'Reminders didn’t go out') } finally { setReminding(false) }
  }
  const lines: React.ReactNode[] = []
  const buttons: React.ReactNode[] = []
  if (todo.clear) lines.push(<span key="clear" className="font-semibold text-green-700">All {column.aggregate.learner_count} done</span>)
  if (todo.grade) {
    lines.push(<span key="grade"><b className="text-foreground">{todo.grade} ready to grade</b></span>)
    buttons.push(<Button key="grade" asChild size="sm"><Link href={gradingHref(column, ctx)}><ClipboardCheck size={14} />Start grading</Link></Button>)
  }
  if (todo.waiting.length) {
    lines.push(<span key="waiting">{todo.waiting.length === 1 ? `${namesOf(todo.waiting, ctx.learners) || 'One learner'} hasn’t handed it in.` : `${todo.waiting.length} haven’t handed it in${namesOf(todo.waiting, ctx.learners) ? `: ${namesOf(todo.waiting, ctx.learners)}` : ''}.`}</span>)
    if (sent || !todo.remindable.length) buttons.push(<span key="reminded" className="inline-flex h-8 items-center rounded-full bg-muted px-3 text-xs font-bold text-muted-foreground">Reminded today</span>)
    else if (ctx.status === 'active') buttons.push(<Button key="remind" type="button" variant="outline" size="sm" disabled={reminding} onClick={() => void remind()}>
      {reminding ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}Remind {todo.remindable.length === 1 ? namesOf(todo.remindable, ctx.learners) || 1 : todo.remindable.length}
    </Button>)
  }
  if (todo.settle.length) {
    lines.push(<span key="settle">Staff confirm this. {todo.settle.length === column.aggregate.learner_count ? 'Nobody has been confirmed yet.' : `${todo.settle.length} still to confirm.`}</span>)
    if (!full) buttons.push(<Button key="settle" type="button" size="sm" onClick={onOpen}><Check size={14} />Settle</Button>)
  }
  if (!lines.length && upcoming) lines.push(<span key="next" className="font-semibold text-[var(--plan-accent)]">Up next</span>)

  if (!full) return lines.length || buttons.length ? <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
    {lines.length ? <span className="flex flex-wrap gap-x-2">{lines}</span> : null}
    {buttons.length ? <span className="flex flex-wrap gap-2">{buttons}</span> : null}
  </div> : null

  return <div className="flex flex-col gap-3 text-sm">
    {column.description ? <p className="whitespace-pre-wrap text-muted-foreground">{column.description}</p> : null}
    <StaffGuide column={column} />
    {lines.length ? <p className="flex flex-col gap-1">{lines}</p> : null}
    {buttons.length ? <div className="flex flex-wrap gap-2">{buttons}</div> : null}
    {todo.settle.length ? <Settle column={column} ctx={ctx} who={todo.settle} /> : null}
    {upcoming || (!todo.clear && !lines.length) ? <Prep column={column} ctx={ctx} /> : null}
  </div>
}

/** The template's staff guide for the step: how to run it (a lesson plan) and the files staff use. */
function StaffGuide({ column }: { column: MatrixColumn }) {
  const files = (column.staff_materials || []).filter((item) => item && item.url)
  if (!column.staff_guide && !files.length) return null
  return <section aria-label="Staff guide" className="flex flex-col gap-2 rounded-xl border border-dashed bg-background p-3">
    <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Staff guide</p>
    {column.staff_guide ? <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{column.staff_guide}</p> : null}
    {files.length ? <div className="flex flex-wrap gap-2">
      {files.map((item, index) => {
        const Icon = item.kind === 'file' ? FileText : Link2
        return <Button key={index} asChild variant="outline" size="sm"><a href={item.url} target="_blank" rel="noreferrer"><Icon size={14} />{item.title || item.url}</a></Button>
      })}
    </div> : null}
  </section>
}

/** Settle a step staff confirm, such as an event: done for everyone, or everyone except the people tapped. */
function Settle({ column, ctx, who }: { column: MatrixColumn; ctx: TodoContext; who: string[] }) {
  const [picking, setPicking] = React.useState(false)
  const [left, setLeft] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)
  const event = column.type === 'event'
  const save = async (except: string[]) => {
    setSaving(true)
    try {
      const result = await goalAdminApi.settle(ctx.orgId, ctx.assignmentUuid, column.template_key, { except_user_uuids: except }, ctx.token)
      toast.success(`${result.settled.length} ${event ? 'marked as there' : 'marked done'}${result.left.length ? `, ${result.left.length} left as they are` : ''}. Each feed has a card.`)
      setPicking(false); setLeft([])
      await ctx.refresh()
    } catch (error: any) { toast.error(error?.message || 'That didn’t save') } finally { setSaving(false) }
  }
  if (ctx.status === 'ended') return null
  const people = who.map((uuid) => ctx.learners.find((learner) => learner.user_uuid === uuid)).filter((learner): learner is MatrixLearner => Boolean(learner))
  if (!picking) return <div className="flex flex-wrap gap-2">
    <Button type="button" size="sm" disabled={saving} onClick={() => void save([])}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{event ? 'Everyone was there' : 'Done for everyone'}</Button>
    <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setPicking(true)}>Everyone except…</Button>
  </div>
  return <div className="flex flex-col gap-2">
    <p className="text-xs font-semibold text-muted-foreground">{event ? 'Tap who missed it:' : 'Tap who isn’t done:'}</p>
    <div role="group" aria-label={event ? 'Who missed it' : 'Who isn’t done'} className="flex flex-wrap gap-1.5">
      {people.map((learner) => {
        const out = left.includes(learner.user_uuid!)
        return <button key={learner.user_uuid} type="button" aria-pressed={out} onClick={() => setLeft(out ? left.filter((uuid) => uuid !== learner.user_uuid) : [...left, learner.user_uuid!])}
          className={cn('h-8 rounded-full border px-3 text-xs font-bold transition', out ? 'border-red-300 bg-red-50 text-red-700 line-through' : 'border-border bg-card hover:bg-muted')}>{personName(learner)}</button>
      })}
    </div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={saving} onClick={() => void save(left)}>{saving ? <Loader2 size={14} className="animate-spin" /> : null}Save · {left.length} {event ? 'missed' : 'left out'}</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => { setPicking(false); setLeft([]) }}>Cancel</Button>
    </div>
  </div>
}

/** Getting ready for a step: try its activity, read how it's reviewed, open its materials. Only what the template has. */
function Prep({ column, ctx }: { column: MatrixColumn; ctx: TodoContext }) {
  const [trying, setTrying] = React.useState(false)
  const [rubric, setRubric] = React.useState(false)
  const activity = column.type === 'activity' ? column.config?.activity_uuid : null
  const materials = (column.materials || []).filter((item) => item && (item.url || item.title))
  const close = column.config?.date || null
  if (!activity && !column.reviewer_guidance && !materials.length && !close) return null
  return <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3">
    <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Prep{close ? ` · ${shortDay(String(close))}` : ''}</p>
    <div className="flex flex-wrap gap-2">
      {activity && ctx.admin ? <Button type="button" variant="outline" size="sm" onClick={() => setTrying(true)}><Play size={14} />Try it yourself</Button> : null}
      {column.reviewer_guidance ? <Button type="button" variant="outline" size="sm" aria-expanded={rubric} onClick={() => setRubric(!rubric)}><ScrollText size={14} />Rubric</Button> : null}
      {materials.map((item, index) => <Button key={index} asChild variant="outline" size="sm"><a href={String(item.url || '#')} target="_blank" rel="noreferrer">{String(item.title || item.url)}</a></Button>)}
    </div>
    {rubric ? <p className="whitespace-pre-wrap text-sm text-foreground">{column.reviewer_guidance}</p> : null}
    {trying && activity ? <EditorPreviewModal activity={{ activity_uuid: activity }} accessToken={ctx.token} onClose={() => setTrying(false)} /> : null}
  </div>
}
