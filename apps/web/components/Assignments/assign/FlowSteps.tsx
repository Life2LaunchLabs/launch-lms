'use client'

import React from 'react'
import { CalendarDays, Flag, Layers, Mail, MessageSquareText, Plus, Footprints, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import PickerField, { type PickerGroup } from '@components/Assignments/PickerField'
import { PersonTile, PlanTile } from '@components/Assignments/Pair'
import { DATE_INPUT } from '@components/Assignments/ScheduleLine'
import type { AssignmentRole } from '@services/assignments/assignments'
import { ROLES, ROLE_DO, isEmail, recipientKey, recipientName, staffProblem, type FlowSchedule, type Recipient, type StaffPick } from '@services/assignments/assignFlow'
import { plural } from '@services/assignments/status'
import type { DirectoryPerson } from '@services/school/people'
import type { TemplateDetail } from '@services/goals/templates'
import type { TemplateDocument } from '@services/goals/types'
import { Field, Segmented } from './flowUi'
import type { GroupOption } from './useAssignData'

const longDate = (value?: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : ''

export function RecipientTile({ pick, size = 'sm' }: { pick: Recipient; size?: 'sm' | 'md' }) {
  const box = size === 'md' ? 'h-8 w-8' : 'h-6 w-6'
  if (pick.kind === 'group' || pick.kind === 'newgroup') return <span className={cn('grid shrink-0 place-items-center rounded-full', box, pick.kind === 'newgroup' ? 'bg-brand-soft text-brand-ink' : 'bg-muted text-foreground')}><Users size={size === 'md' ? 16 : 13} aria-hidden="true" /></span>
  if (pick.kind === 'email') return <span className={cn('grid shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-border bg-muted text-muted-foreground', box)}><Mail size={size === 'md' ? 14 : 12} aria-hidden="true" /></span>
  return <PersonTile person={{ id: pick.id, username: pick.username, first_name: pick.name, avatar_image: pick.avatar_image, user_uuid: pick.user_uuid }} size={size} />
}

const tokenExtra = (pick: Recipient) => pick.kind === 'group' ? <em className="text-[11px] font-semibold not-italic text-muted-foreground">{pick.count}</em>
  : pick.kind === 'newgroup' ? <em className="text-[11px] font-semibold not-italic text-muted-foreground">new</em> : null

export function RecipientTokens({ picks }: { picks: Recipient[] }) {
  return <div className="flex flex-wrap gap-1.5">{picks.map((pick) => <span key={recipientKey(pick)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-[3px] pl-[3px] pr-3 text-[13px] font-semibold">
    <RecipientTile pick={pick} />{recipientName(pick)}{tokenExtra(pick)}
  </span>)}</div>
}

/** Who it's for: groups, the organization's learners, an email to invite, or a new group. */
export function WhoStep({ picks, setPicks, query, setQuery, groups, people, canGroups, taken }: {
  picks: Recipient[]; setPicks: (picks: Recipient[]) => void; query: string; setQuery: (query: string) => void // eslint-disable-line no-unused-vars
  groups: GroupOption[]; people: DirectoryPerson[]; canGroups: boolean; taken: { groups: Set<number>; people: Set<number> }
}) {
  const q = query.trim().toLowerCase()
  const on = new Set(picks.map(recipientKey))
  const add = (pick: Recipient) => setPicks([...picks, pick])
  const options: PickerGroup[] = []
  if (canGroups) options.push({ heading: 'Groups', items: groups.filter((group) => (!q || group.name.toLowerCase().includes(q)) && !on.has(`group:${group.id}`) && (q || !taken.groups.has(group.id))).map((group) => ({
    key: `group:${group.id}`, tile: <RecipientTile pick={{ kind: 'group', id: group.id, name: group.name, count: group.member_count }} size="md" />, title: group.name,
    sub: taken.groups.has(group.id) ? 'Already has this plan' : plural(group.member_count, 'learner'), disabled: taken.groups.has(group.id),
    onPick: () => add({ kind: 'group', id: group.id, name: group.name, count: group.member_count }),
  })) })
  options.push({ heading: q ? 'People' : 'People in your organization', items: people.filter((item) => !on.has(`member:${item.user.id}`) && (q || !taken.people.has(item.user.id))).slice(0, q ? 8 : 4).map((item) => {
    const pick: Recipient = { kind: 'member', id: item.user.id, name: item.user.name, username: item.user.username, avatar_image: item.user.avatar_image, user_uuid: item.user.user_uuid }
    return { key: recipientKey(pick), tile: <RecipientTile pick={pick} size="md" />, title: item.user.name, sub: taken.people.has(item.user.id) ? 'Already has this plan' : item.groups.map((group) => group.name).join(', ') || `@${item.user.username}`,
      disabled: taken.people.has(item.user.id), onPick: () => add(pick) }
  }) })
  const actions = []
  if (q && isEmail(q) && !on.has(`email:${q}`)) actions.push({ key: `email:${q}`, action: true, tile: <RecipientTile pick={{ kind: 'email', email: q }} size="md" />, title: `Invite ${q}`,
    sub: 'They get an email to sign up. Their assignment waits for them.', onPick: () => add({ kind: 'email', email: q }) })
  if (q && !isEmail(q) && canGroups && !groups.some((group) => group.name.toLowerCase() === q) && !on.has(`newgroup:${q}`)) actions.push({ key: `newgroup:${q}`, action: true,
    tile: <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-ink"><Plus size={16} aria-hidden="true" /></span>, title: `Create group “${query.trim()}”`,
    sub: 'Empty for now. Add people to it any time.', onPick: () => add({ kind: 'newgroup', name: query.trim() }) })
  if (actions.length) options.push({ items: actions })
  return <div className="mt-[22px] flex flex-col gap-3">
    <PickerField picks={picks} tokenKey={recipientKey} tokenTile={(pick) => <RecipientTile pick={pick} />} tokenLabel={recipientName} tokenExtra={tokenExtra}
      onRemove={(pick) => setPicks(picks.filter((item) => recipientKey(item) !== recipientKey(pick)))} query={query} onQuery={setQuery} groups={options}
      placeholder={picks.length ? 'Add more' : canGroups ? 'Name, email or group' : 'Name or email'} label={canGroups ? 'Add people or groups' : 'Add people'}
      empty={q ? 'No one by that name. Type their email to invite them.' : null} />
    {picks.length > 1 ? <p className="flex items-start gap-2 text-[13px] leading-[1.45] text-muted-foreground"><Layers size={16} className="mt-px shrink-0" aria-hidden="true" />
      <span>{picks.length} assignments, one for each. They share the plan but get their own dates, staff and messages.</span></p> : null}
  </div>
}

/** The schedule's settings: self-paced or on a schedule, and the start and end. Stages sit on the right. */
export function ScheduleStep({ schedule, setSchedule, onStart }: { schedule: FlowSchedule; setSchedule: (schedule: FlowSchedule) => void; onStart: (start: string) => void }) { // eslint-disable-line no-unused-vars
  const scheduled = schedule.mode === 'sched'
  return <div className="mt-[22px] flex flex-col gap-3">
    <Segmented big label="Pacing" value={schedule.mode} onChange={(mode) => setSchedule({ ...schedule, mode })}
      options={[{ value: 'pace', label: <><Footprints aria-hidden="true" />Self-paced</> }, { value: 'sched', label: <><CalendarDays aria-hidden="true" />On a schedule</> }]} />
    <div className="grid grid-cols-2 gap-3.5">
      <Field label="Start date"><input type="date" aria-label="Start date" className={cn(DATE_INPUT, 'h-[42px] w-full')} value={scheduled ? schedule.starts[0] || schedule.start : schedule.start} onChange={(event) => onStart(event.target.value)} /></Field>
      <Field label="End date" optional={!scheduled}>
        {scheduled || schedule.hasEnd ? <span className="flex items-center gap-1.5">
          <input type="date" aria-label="End date" className={cn(DATE_INPUT, 'h-[42px] w-full')} value={schedule.end} onChange={(event) => setSchedule({ ...schedule, end: event.target.value })} />
          {scheduled ? null : <button type="button" onClick={() => setSchedule({ ...schedule, hasEnd: false })} aria-label="Remove end date" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-card"><X size={16} /></button>}
        </span> : <button type="button" onClick={() => setSchedule({ ...schedule, hasEnd: true })} className="inline-flex h-[42px] items-center gap-2 rounded-full border border-dashed border-border bg-card px-4 text-sm font-semibold text-muted-foreground"><Plus size={17} />Add an end date</button>}
      </Field>
    </div>
  </div>
}

/** Staff: who answers questions and reviews work, each Lead, Review or Comment. */
export function StaffStep({ staff, setStaff, query, setQuery, options }: {
  staff: StaffPick[]; setStaff: (staff: StaffPick[]) => void; query: string; setQuery: (query: string) => void; options: DirectoryPerson[] // eslint-disable-line no-unused-vars
}) {
  const chosen = new Set(staff.map((item) => item.id))
  const available = options.filter((item) => !chosen.has(item.user.id))
  const add = (item: DirectoryPerson) => setStaff([...staff, { id: item.user.id, name: item.user.name, username: item.user.username, avatar_image: item.user.avatar_image, user_uuid: item.user.user_uuid, role: 'review' }])
  const setRole = (id: number, role: AssignmentRole) => setStaff(staff.map((item) => item.id === id ? { ...item, role } : item))
  const problem = staffProblem(staff)
  return <div className="mt-[22px] flex flex-col gap-3">
    <PickerField picks={staff} tokenKey={(item) => String(item.id)} tokenLabel={(item) => `${item.name.split(' ')[0]}${item.you ? ' (you)' : ''}`}
      tokenTile={(item) => <PersonTile person={{ id: item.id, username: item.username, first_name: item.name, avatar_image: item.avatar_image, user_uuid: item.user_uuid }} size="sm" />}
      tokenExtra={(item) => <select value={item.role} aria-label={`Role for ${item.name}`} onChange={(event) => setRole(item.id, event.target.value as AssignmentRole)}
        className={cn('ml-0.5 rounded-full border-0 px-1.5 py-[3px] text-xs font-bold', item.role === 'lead' ? 'bg-foreground text-background' : 'bg-muted text-foreground')}>
        {Object.entries(ROLES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>}
      onRemove={(item) => setStaff(staff.filter((other) => other.id !== item.id))} query={query} onQuery={setQuery}
      groups={[{ heading: 'Staff in your organization', items: available.map((item) => ({ key: String(item.user.id), tile: <PersonTile person={{ id: item.user.id, username: item.user.username, first_name: item.user.name, avatar_image: item.user.avatar_image }} />,
        title: item.user.name, sub: item.role_name || (item.role === 'admin' ? 'Admin' : 'Staff'), onPick: () => add(item) })) }]}
      placeholder={staff.length ? 'Add more staff' : 'Search staff'} label="Add staff" empty={query.trim() ? 'No staff by that name.' : 'Everyone on staff is added.'} slim />
    {problem ? <p className="flex items-center gap-2 text-[13px] text-amber-700 dark:text-amber-300"><Flag size={15} className="shrink-0" aria-hidden="true" /><span>{problem}</span></p> : null}
    <dl className="grid gap-1.5 text-[13px]">{(Object.keys(ROLES) as AssignmentRole[]).map((role) => <div key={role} className="grid grid-cols-[92px_1fr] gap-2.5"><dt className="font-bold">{ROLES[role]}</dt><dd className="text-muted-foreground">{ROLE_DO[role]}</dd></div>)}</dl>
  </div>
}

/** The message everyone assigned gets, and how each kind of person gets it. */
export function MessageStep({ welcome, setWelcome, picks, orgName }: { welcome: string; setWelcome: (value: string) => void; picks: Recipient[]; orgName: string }) { // eslint-disable-line no-unused-vars
  const inOrg = picks.some((pick) => pick.kind !== 'email')
  const invited = picks.some((pick) => pick.kind === 'email')
  return <div className="mt-[22px] flex flex-col gap-3">
    <Field label="Message"><textarea value={welcome} onChange={(event) => setWelcome(event.target.value)} rows={5} aria-label="Message"
      className="min-h-[76px] resize-y rounded-[10px] border-[1.5px] border-border bg-card px-3 py-2.5 text-[15px] leading-[1.45] focus:border-brand focus:outline-none" /></Field>
    <ul className="flex flex-col gap-2.5 text-[13.5px] leading-[1.45] text-muted-foreground">
      {inOrg ? <li className="flex gap-2.5"><MessageSquareText size={17} className="mt-px shrink-0 text-foreground" aria-hidden="true" /><span><b className="text-foreground">People in {orgName}</b> get it in their messages, and the plan shows up in their Plans.</span></li> : null}
      {invited ? <li className="flex gap-2.5"><Mail size={17} className="mt-px shrink-0 text-foreground" aria-hidden="true" /><span><b className="text-foreground">New people</b> get an email with a link to sign up.</span></li> : null}
    </ul>
  </div>
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return <section className="border-t border-border px-0.5 py-3.5">
    <div className="mb-2 flex items-center justify-between"><h3 className="text-[13px] font-semibold uppercase tracking-[.06em] text-muted-foreground">{title}</h3>
      <button type="button" onClick={onEdit} className="text-[13px] font-bold text-brand-ink">Edit</button></div>
    {children}
  </section>
}

/** Everything once more before anything is sent. */
export function ReviewStep({ template, document, picks, schedule, staff, welcome, goTo }: {
  template: TemplateDetail; document: TemplateDocument; picks: Recipient[]; schedule: FlowSchedule; staff: StaffPick[]; welcome: string; goTo: (step: number) => void // eslint-disable-line no-unused-vars
}) {
  const scheduled = schedule.mode === 'sched'
  const start = scheduled ? schedule.starts[0] || schedule.start : schedule.start
  const end = scheduled || schedule.hasEnd ? schedule.end : ''
  const steps = document.stages.reduce((sum, stage) => sum + stage.steps.length, 0)
  const today = new Date().toISOString().slice(0, 10)
  return <div className="mt-[22px] flex flex-col gap-3">
    <div className="flex items-center gap-4 rounded-[18px] border border-border bg-card p-4">
      <PlanTile plan={{ template_uuid: template.template_uuid, title: template.title, thumbnail_image: template.thumbnail_image, icon: template.icon, color: template.color, version: template.published_version }} size="lg" />
      <span className="flex min-w-0 flex-col gap-1"><b className="text-xl">{template.title}</b>
        {template.description ? <span className="text-[13.5px] leading-[1.4] text-muted-foreground">{template.description}</span> : null}
        <span className="mt-1 flex flex-wrap items-center gap-3 text-[12.5px] text-muted-foreground">
          {template.live_version?.semver || template.published_version ? <span className="rounded-full bg-good-soft px-2 py-0.5 font-bold text-good">v{template.live_version?.semver || template.published_version}</span> : null}
          <span>{plural(document.stages.length, 'stage')} · {plural(steps, 'step')}</span>
        </span>
      </span>
    </div>
    <ReviewSection title="Assigned to" onEdit={() => goTo(0)}><RecipientTokens picks={picks} /></ReviewSection>
    <ReviewSection title="Schedule" onEdit={() => goTo(1)}>
      <dl className="flex flex-col gap-1 text-[14.5px]">
        <div className="grid grid-cols-[150px_1fr] gap-2.5"><dt className="text-muted-foreground">Starts</dt><dd>{start === today ? 'Today' : longDate(start)}</dd></div>
        {scheduled ? document.stages.map((stage, index) => index && schedule.starts[index] ? <div key={stage.key || index} className="grid grid-cols-[150px_1fr] gap-2.5"><dt className="pl-3.5 text-muted-foreground">{stage.title}</dt><dd>{longDate(schedule.starts[index])}</dd></div> : null) : null}
        <div className="grid grid-cols-[150px_1fr] gap-2.5"><dt className="text-muted-foreground">Ends</dt><dd>{end ? longDate(end) : 'No end date'}</dd></div>
      </dl>
      {scheduled ? null : <p className="mt-1.5 text-[13px] text-muted-foreground">Self-paced</p>}
    </ReviewSection>
    <ReviewSection title="Staff" onEdit={() => goTo(2)}>
      <div className="flex flex-wrap gap-x-[18px] gap-y-2 text-sm font-semibold">{staff.map((item) => <span key={item.id} className="inline-flex items-center gap-[7px]">
        <PersonTile person={{ id: item.id, username: item.username, first_name: item.name, avatar_image: item.avatar_image }} size="sm" />{item.name}<em className="text-xs font-semibold not-italic text-muted-foreground">{ROLES[item.role]}</em>
      </span>)}</div>
    </ReviewSection>
    <ReviewSection title="Message" onEdit={() => goTo(3)}>
      <p className="whitespace-pre-wrap border-l-[3px] border-border pl-3 text-[14.5px] leading-normal">{welcome || <span className="text-muted-foreground">No message</span>}</p>
      <p className="mt-1.5 text-[13px] text-muted-foreground">Sends when you assign.</p>
    </ReviewSection>
  </div>
}
