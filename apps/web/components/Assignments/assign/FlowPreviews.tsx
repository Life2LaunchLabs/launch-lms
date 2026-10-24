'use client'

import React from 'react'
import { ChevronRight, Flag, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import StatusBar from '@components/Assignments/StatusBar'
import ScheduleLine from '@components/Assignments/ScheduleLine'
import { PersonTile, PlanTile, TargetTile } from '@components/Assignments/Pair'
import { stepDefinition } from '@components/Goals/steps'
import type { AssignmentListItem, AssignmentPlan } from '@services/assignments/assignments'
import { ROLES, ROLE_DO, recipientKey, recipientName, type FlowSchedule, type Recipient, type StaffPick } from '@services/assignments/assignFlow'
import { plural, shortDate } from '@services/assignments/status'
import type { StepTypeKey, TemplateDocument } from '@services/goals/types'
import { RecipientTile } from './FlowSteps'
import { Frame, PreviewCaption } from './flowUi'

const NOT_STARTED = { done: 0, review: 0, behind: 0, open: 1, locked: 2 }

function recipientSub(pick: Recipient) {
  if (pick.kind === 'group') return plural(pick.count, 'learner')
  if (pick.kind === 'newgroup') return 'New group · add people any time'
  if (pick.kind === 'email') return 'Gets an email invite'
  return `@${pick.username}`
}

/** Who: the plan's assignments list, with a row for each pick on top of the ones running. */
export function ListPreview({ plan, picks, running, slug }: { plan: AssignmentPlan; picks: Recipient[]; running: AssignmentListItem[]; slug: string }) {
  const row = 'grid grid-cols-[32px_minmax(0,1fr)_minmax(70px,120px)_40px] items-center gap-2.5 rounded-[11px] border border-border bg-card px-2.5 py-[9px]'
  return <><PreviewCaption><span>Assignments of this plan</span></PreviewCaption>
    <Frame url={`life2launch.app/${slug}/plans/assignments`}><div className="relative min-h-[380px] px-4 pb-4 pt-3.5">
      <div className="mb-2.5 mt-0.5 flex items-center gap-2"><PlanTile plan={plan} size="sm" /><b className="text-[13px]">{plan.title}</b>{plan.version ? <span className="text-muted-foreground">v{plan.version}</span> : null}</div>
      <div className="flex flex-col gap-1.5">
        {picks.map((pick) => <div key={recipientKey(pick)} className={cn(row, 'animate-in fade-in slide-in-from-top-2')}>
          <RecipientTile pick={pick} size="md" /><span className="min-w-0"><b className="block truncate text-xs">{recipientName(pick)}</b><span className="text-[10px] text-muted-foreground">{recipientSub(pick)}</span></span>
          <StatusBar counts={NOT_STARTED} now={false} /><span className="rounded-full bg-good-soft px-[7px] py-0.5 text-center text-[9.5px] font-extrabold text-good">New</span>
        </div>)}
        {picks.length ? null : <div className="rounded-[11px] border-[1.5px] border-dashed border-border p-[18px] text-center text-[11.5px] text-muted-foreground">Everyone you add gets a row here, and a page of their own</div>}
        {running.map((item) => <div key={item.assignment_uuid} className={cn(row, 'opacity-55')}>
          <TargetTile target={item.target} size="md" /><span className="min-w-0"><b className="block truncate text-xs">{item.target.name}</b><span className="text-[10px] text-muted-foreground">{item.target.type === 'group' ? plural(item.learner_count, 'learner') : item.scheduled ? 'On a schedule' : 'Self-paced'}</span></span>
          <StatusBar counts={item.counts} now={false} /><span />
        </div>)}
      </div>
    </div></Frame></>
}

/** Schedule: the plan's stages, each with its start when on a schedule, opening to its steps as quiet lines. */
export function StagesPanel({ document, schedule, setSchedule }: { document: TemplateDocument; schedule: FlowSchedule; setSchedule: (schedule: FlowSchedule) => void }) { // eslint-disable-line no-unused-vars
  const [openStage, setOpenStage] = React.useState<number | null>(null)
  const [openStep, setOpenStep] = React.useState<string | null>(null)
  const scheduled = schedule.mode === 'sched'
  const setStart = (index: number, day: string) => setSchedule({ ...schedule, starts: schedule.starts.map((value, at) => at === index ? day : value) })
  return <><PreviewCaption><span>{scheduled ? 'Stages' : 'The plan'}</span></PreviewCaption>
    <div className="flex flex-col gap-2">
      {document.stages.map((stage, index) => {
        const open = openStage === index
        const dated = stage.steps.filter((step) => { const dates = schedule.steps[String(step.key)]; return dates && (dates.start_date || dates.due_date) }).length
        return <div key={stage.key || index} className="rounded-2xl border border-border bg-card p-1">
          <div className="flex items-center gap-3 py-2 pl-2.5 pr-1.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-extrabold">{index + 1}</span>
            <span className="flex min-w-0 flex-1 flex-col"><b className="text-[14.5px]">{stage.title}</b><span className="text-[12.5px] text-muted-foreground">{plural(stage.steps.length, 'step')}{dated ? ` · ${dated} with dates` : ''}</span></span>
            {scheduled ? index === 0 ? <span className="w-[150px] pl-2.5 text-[13px] font-semibold">{shortDate(schedule.starts[0])}</span>
              : <input type="date" aria-label={`${stage.title} starts`} value={schedule.starts[index] || ''} onChange={(event) => setStart(index, event.target.value)}
                className="h-[34px] w-[150px] rounded-[10px] border-[1.5px] border-border bg-card px-2 text-[13px] focus:border-brand focus:outline-none" /> : null}
            <button type="button" onClick={() => setOpenStage(open ? null : index)} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} steps`}
              className={cn('grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-transform', open && 'rotate-90')}><ChevronRight size={17} /></button>
          </div>
          {open ? <div className="flex flex-col pb-1.5 pl-[30px] pr-1">{stage.steps.map((step) => {
            const key = String(step.key)
            if (scheduled) return <ScheduleLine key={key} step={{ key, title: step.title, type: step.type }} dates={schedule.steps[key] || {}} open={openStep === key}
              onToggle={() => setOpenStep(openStep === key ? null : key)} onChange={(dates) => setSchedule({ ...schedule, steps: { ...schedule.steps, [key]: dates } })} />
            const type = stepDefinition(step.type as StepTypeKey)
            const Icon = type.icon
            return <div key={key} className="flex min-h-10 items-center gap-2.5 px-2.5 py-2 text-sm"><span style={{ color: type.color }}><Icon size={17} aria-hidden="true" /></span><span className="min-w-0 flex-1 truncate">{step.title}</span></div>
          })}</div> : null}
        </div>
      })}
      {scheduled ? <div className="rounded-2xl border border-dashed border-border p-1"><div className="flex items-center gap-3 py-2 pl-2.5 pr-1.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted"><Flag size={14} aria-hidden="true" /></span>
        <span className="flex min-w-0 flex-1 flex-col"><b className="text-[14.5px]">End</b><span className="text-[12.5px] text-muted-foreground">Last day of the plan</span></span>
        <span className="w-[150px] pl-2.5 text-[13px] font-semibold">{schedule.end ? shortDate(schedule.end) : '—'}</span><span className="w-9" />
      </div></div> : null}
    </div></>
}

/** Staff: the assignment's People tab, with its staff in place. */
export function StaffPreview({ plan, picks, staff, slug }: { plan: AssignmentPlan; picks: Recipient[]; staff: StaffPick[]; slug: string }) {
  const name = picks[0] ? recipientName(picks[0]) : 'Your group'
  return <><PreviewCaption><span>People tab of the assignment</span></PreviewCaption>
    <Frame url={`life2launch.app/${slug}/assignments/people`}>
      <div className="border-b border-border bg-[color-mix(in_srgb,hsl(var(--brand))_6%,hsl(var(--background)))] px-4 pt-3.5">
        <b className="block truncate text-base tracking-tight">{name}</b>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">working on <PlanTile plan={plan} size="sm" round />{plan.title}</span>
        <div className="mt-2.5 flex gap-3 text-[11px] font-bold text-muted-foreground"><span className="pb-1.5">Steps</span><b className="border-b-2 border-foreground pb-1.5 text-foreground">People</b></div>
      </div>
      <div className="p-4">
        <h2 className="text-[15px] font-bold">Staff <span className="text-muted-foreground">{staff.length}</span></h2>
        <div className="mt-2 rounded-[14px] border border-border">{staff.length ? staff.map((item) => <div key={item.id} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0">
          <PersonTile person={{ id: item.id, username: item.username, first_name: item.name, avatar_image: item.avatar_image }} />
          <span className="min-w-0"><b className="block truncate text-xs">{item.name}</b><span className="block truncate text-[10.5px] text-muted-foreground">{ROLE_DO[item.role]}</span></span>
          <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-bold', item.role === 'lead' ? 'bg-foreground text-background' : 'bg-muted')}>{ROLES[item.role]}</span>
        </div>) : <p className="p-3.5 text-muted-foreground">No staff yet</p>}</div>
        <h2 className="mt-[18px] text-[15px] font-bold">Learners</h2>
        <div className="mt-2 rounded-[14px] border border-border opacity-50">{[0, 1].map((index) => <div key={index} className="flex items-center gap-2.5 border-b border-border px-3 py-2.5 last:border-b-0">
          <span className="grid h-8 w-8 place-items-center rounded-full border-[1.5px] border-dashed border-border bg-muted text-muted-foreground"><User size={14} /></span><span className="h-2 w-28 rounded bg-muted" />
        </div>)}</div>
      </div>
    </Frame></>
}

/** Message: what they see, a plan card in the app (or the invite page for an email) beside the message on a phone. */
export function MessagePreview({ plan, picks, welcome, orgName, from, steps, scheduled, start }: {
  plan: AssignmentPlan; picks: Recipient[]; welcome: string; orgName: string; from: string; steps: number; scheduled: boolean; start: string
}) {
  const invite = picks.find((pick) => pick.kind === 'email')
  const logo = <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[#0B8077] text-[11px] font-extrabold text-white">{orgName.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase()}</span>
  const short = welcome.length > 110 ? `${welcome.slice(0, 108)}…` : welcome
  return <><PreviewCaption><span>What they see</span></PreviewCaption>
    <div className="relative pb-[60px]">
      <Frame url={invite ? 'life2launch.app/join' : 'life2launch.app/plans'} className="w-[86%]">
        {invite ? <div className="grid place-items-center bg-muted/40 px-4 py-8"><div className="w-full max-w-[300px] rounded-2xl border border-border bg-card px-5 pb-5 pt-6 text-center">
          <div className="flex justify-center">{logo}</div><small className="mt-2 block text-muted-foreground">{orgName} invited you</small><b className="mt-1 block text-base">Start {plan.title}</b>
          {short ? <p className="mt-2 text-[11.5px] italic text-muted-foreground">“{short}”<span className="mt-1 block not-italic">{from}</span></p> : null}
          <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-border p-2 text-left"><PlanTile plan={plan} size="md" /><span className="min-w-0"><b className="block truncate">{plan.title}</b><span className="text-muted-foreground">{plural(steps, 'step')}</span></span></div>
          <span className="mt-3 block rounded-full bg-primary py-2 font-bold text-primary-foreground">Create your account</span><span className="mt-2 block text-muted-foreground">Already on Life2Launch? Sign in</span>
        </div></div> : <div className="p-4"><div className="text-sm font-bold">Your plans</div><div className="mt-2.5 overflow-hidden rounded-xl border border-border bg-card">
          <PlanTile plan={plan} size="lg" />
          <div className="p-3"><b className="block text-sm">{plan.title}</b><span className="mt-1 flex items-center gap-1.5 text-muted-foreground">{orgName} · from {from}</span><span className="mt-2.5 inline-block rounded-full bg-primary px-3 py-1.5 font-bold text-primary-foreground">Start step 1</span></div>
        </div></div>}
      </Frame>
      <div className="absolute bottom-0 right-0 flex w-[44%] min-w-[190px] flex-col overflow-hidden rounded-[26px] border-[5px] border-foreground bg-background shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2"><span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-[#0B8077] text-[10px] font-extrabold text-white">{orgName.slice(0, 2).toUpperCase()}</span><span className="flex flex-col text-[11px]"><b>{orgName}</b><span className="text-muted-foreground">Messages</span></span></div>
        <div className="flex flex-col gap-2 p-2.5 text-[11px]">
          <div className="text-center text-[10px] text-muted-foreground">{from.split(' ')[0]} assigned you {plan.title}</div>
          {welcome ? <div className="rounded-2xl rounded-bl-md bg-muted px-3 py-2"><small className="block font-bold">{from.split(' ')[0]}</small><span className="whitespace-pre-wrap">{welcome}</span></div> : null}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-2"><PlanTile plan={plan} size="sm" /><span className="min-w-0"><b className="block truncate">{plan.title}</b><span className="text-muted-foreground">{plural(steps, 'step')}{scheduled ? ` · starts ${shortDate(start)}` : ' · at your pace'}</span></span></div>
        </div>
        <div className="m-2 rounded-full border border-border px-3 py-1.5 text-[11px] text-muted-foreground">Message</div>
      </div>
    </div>
    <p className="mt-3 text-center text-[12.5px] text-muted-foreground">{invite ? `Left: the invite page for ${recipientName(invite)}. Right: the message in the app.` : 'Left: their Plans page. Right: the message in the app.'}</p></>
}
