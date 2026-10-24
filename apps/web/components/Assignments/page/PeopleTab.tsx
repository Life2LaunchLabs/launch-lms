'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { CircleHelp, ClipboardCheck, Clock, Loader2, Mail, Search, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import StatusBar, { StatusLegend } from '@components/Assignments/StatusBar'
import { CountIcons, MessageButton } from '@components/Assignments/Needs'
import { PersonTile } from '@components/Assignments/Pair'
import RequirementEvidenceExport from '@components/Goals/admin/live/RequirementEvidenceExport'
import { goalAdminApi } from '@services/goals/admin'
import { assignmentApi, type AssignmentDetail, type AssignmentLearner, type AssignmentPeople, type AssignmentPerson, type AssignmentRole } from '@services/assignments/assignments'
import { ROLES, ROLE_DO } from '@services/assignments/assignFlow'
import { invitedRows, shownLearners, SORTS, type PeopleFilter, type PeopleSort } from '@services/assignments/people'
import { personLabel, shortDate } from '@services/assignments/status'

const SELECT = 'h-[34px] rounded-[10px] border-[1.5px] border-border bg-card px-2.5 text-[13px] font-semibold focus:border-brand focus:outline-none'
const ROW = 'flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-border px-4 py-3 last:border-b-0 sm:flex-nowrap'

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return <section className="mt-6 first:mt-0">
    <h2 className="mb-2.5 flex items-center gap-2 text-lg font-bold">{title}<span className="text-[13px] font-semibold text-muted-foreground">{count}</span></h2>
    {children}
  </section>
}

/**
 * The People tab: the assignment's staff, each with their role (which a Lead can change), then
 * its learners with where each is, what they need, and Message; invitations not taken up yet
 * at the end, with Resend.
 */
export default function PeopleTab({ detail, people, filter, setFilter, orgId, token, onChanged, onMessage }: {
  detail: AssignmentDetail
  people?: AssignmentPeople
  filter: PeopleFilter
  setFilter: (filter: PeopleFilter) => void // eslint-disable-line no-unused-vars
  orgId: number
  token?: string
  onChanged: () => unknown
  onMessage: (person: AssignmentPerson) => void // eslint-disable-line no-unused-vars
}) {
  const [sort, setSort] = React.useState<PeopleSort>('az')
  const [search, setSearch] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const group = detail.target.type === 'group'
  const editable = detail.can_manage && detail.status !== 'ended'
  const setRole = async (userId: number, role: AssignmentRole) => {
    const collaborators = detail.staff.filter((member) => member.person).map((member) => ({ user_id: member.person!.id, role_key: member.person!.id === userId ? role : member.role }))
    if (!collaborators.some((item) => item.role_key === 'lead')) return toast.error('Someone has to lead it.')
    setBusy(true)
    try { await goalAdminApi.updateAssignment(orgId, detail.assignment_uuid, { collaborators }, token); await onChanged() } catch (error: any) { toast.error(error?.message || 'That didn’t go through') } finally { setBusy(false) }
  }
  const resend = async () => {
    try { const { sent } = await assignmentApi.resend(orgId, detail.assignment_uuid, token); toast.success(sent ? 'Invitation sent again.' : 'Nothing to send.') } catch (error: any) { toast.error(error?.message || 'That didn’t go through') }
  }
  const rows = people ? shownLearners(people.learners, filter, sort, search) : []
  const invited = people && !search.trim() ? invitedRows(people.learners) : []
  const needs = people?.needs || detail.needs
  const chip = (value: PeopleFilter, label: string, icon?: React.ReactNode, count?: number) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
    className={cn('inline-flex h-[34px] items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold [&_svg]:h-[15px] [&_svg]:w-[15px]',
      filter === value ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:bg-muted')}>{icon}{label}{count !== undefined ? <b>{count}</b> : null}</button>

  return <div className="max-w-[980px]">
    <Section title="Staff" count={detail.staff.length}>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {detail.staff.map((member) => member.person ? <div key={member.person.id} className={ROW}>
          <PersonTile person={member.person} />
          <span className="min-w-0 flex-1"><b className="block truncate text-sm font-semibold">{personLabel(member.person)}</b><span className="text-[12.5px] text-muted-foreground">{ROLE_DO[member.role]}</span></span>
          {editable ? <select className={SELECT} value={member.role} disabled={busy} aria-label={`Role for ${personLabel(member.person)}`} onChange={(event) => void setRole(member.person!.id, event.target.value as AssignmentRole)}>
            {Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select> : <span className="text-[13px] font-semibold">{ROLES[member.role]}</span>}
        </div> : null)}
      </div>
    </Section>
    <Section title={group ? 'Learners' : 'Learner'} count={people?.learners.length ?? detail.learner_count}>
      {group ? <div className="mb-3 flex flex-wrap items-center gap-2">
        {chip('all', 'Everyone', undefined, people?.learners.filter((row) => row.person).length)}
        {chip('questions', 'Questions', <CircleHelp />, needs.questions)}
        {chip('review', 'To review', <ClipboardCheck />, needs.review)}
        {chip('behind', 'Past due', <Clock />, needs.behind)}
        <span className="flex-1" />
        <label className="relative flex items-center">
          <Search size={14} className="absolute left-2.5 text-muted-foreground" aria-hidden="true" />
          <input aria-label="Search learners" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search learners"
            className="h-[34px] w-44 rounded-[10px] border-[1.5px] border-border bg-card pl-8 pr-2.5 text-[13px] focus:border-brand focus:outline-none" />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">Sort
          <select className={SELECT} value={sort} aria-label="Sort learners" onChange={(event) => setSort(event.target.value as PeopleSort)}>
            {SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <RequirementEvidenceExport orgId={orgId} token={token} scope={{ assignment_uuid: detail.assignment_uuid, user_ids: rows.map((row) => row.person!.id) }} />
      </div> : null}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {!people ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div> : null}
        <LearnerRows rows={rows} invited={filter === 'all' ? invited : []} ended={detail.status === 'ended'} onMessage={onMessage} onResend={editable ? () => void resend() : undefined} />
        {people && !rows.length && (filter !== 'all' || search.trim()) ? <p className="px-4 py-4 text-sm text-muted-foreground">No one here right now.</p> : null}
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <StatusLegend />
        <span className="text-[12.5px] text-muted-foreground">Questions clear once you read them. Work to review stays until you review it. Past-due steps show as a line in their messages.</span>
      </div>
    </Section>
  </div>
}

/** Learners on an assignment, each with where they are and what they need, then invitations not taken up. */
export function LearnerRows({ rows, invited = [], ended, onMessage, onResend }: {
  rows: AssignmentLearner[]
  invited?: AssignmentLearner[]
  ended: boolean
  onMessage?: (person: AssignmentPerson) => void // eslint-disable-line no-unused-vars
  onResend?: () => void
}) {
  return <>
    {rows.map((row) => <div key={row.goal_uuid} className={ROW}>
      <PersonTile person={row.person} />
      <b className="min-w-0 flex-1 truncate text-sm font-semibold sm:w-48 sm:flex-none">{personLabel(row.person)}</b>
      <span className="order-last w-full sm:order-none sm:w-auto sm:flex-1"><StatusBar counts={row.counts} unit="steps" now={!ended} label={personLabel(row.person)} /></span>
      <CountIcons needs={row.needs} className="w-[92px] justify-end" />
      {onMessage ? <MessageButton onClick={() => onMessage(row.person!)} /> : null}
    </div>)}
    {invited.map((row) => <div key={row.goal_uuid} className={ROW}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-border bg-muted text-muted-foreground"><Mail size={14} aria-hidden="true" /></span>
      <b className="min-w-0 flex-1 truncate text-sm font-semibold sm:w-48 sm:flex-none">{row.email}</b>
      <span className="flex-1 text-[13px] text-muted-foreground">Invited {shortDate(row.update_date)} · hasn’t joined yet</span>
      {onResend ? <button type="button" onClick={onResend} className="inline-flex h-[34px] min-w-28 items-center justify-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] font-semibold hover:border-foreground">
        <Send size={15} aria-hidden="true" />Resend
      </button> : null}
    </div>)}
  </>
}
