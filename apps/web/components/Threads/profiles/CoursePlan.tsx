'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Check, DownloadSimple, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { Loader2 } from 'lucide-react'
import { usePeopleContext } from '@components/Admin/People/usePeople'
import { supportApi, supportKey } from '@services/school/support'
import { COURSE_SOURCE_LABELS, COURSE_STATUS_LABELS, coursePlanKey, coursesApi, type CoursePlan as Plan, type CourseStatus, type CourseWrite, type EppCourse } from '@services/epp/courses'
import { Card } from './ProfileFrame'

const GRADES = [9, 10, 11, 12]
const field = 'h-9 w-full rounded-lg border border-border bg-background px-2 text-sm'
const credits = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, ''))

const blank = (grade = 9): CourseWrite => ({ grade, subject: 'language_arts', title: '', credits: 1, status: 'planned' })

/** Add or change one course. */
function CourseForm({ plan, initial, onSave, onCancel, busy, label }: { plan: Plan; initial: CourseWrite; onSave: React.Dispatch<CourseWrite>; onCancel: () => void; busy: boolean; label: string }) {
  const [value, setValue] = React.useState<CourseWrite>(initial)
  const set = (patch: CourseWrite) => setValue((current) => ({ ...current, ...patch }))
  return <form className="grid gap-2 rounded-xl bg-muted/50 p-3 @lg:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1.3fr)_4.5rem_8rem_auto]"
    onSubmit={(event) => { event.preventDefault(); if ((value.title || '').trim()) onSave(value) }}>
    <label className="text-xs"><span className="sr-only">Grade</span>
      <select aria-label="Grade" className={field} value={value.grade} onChange={(event) => set({ grade: Number(event.target.value) })}>
        {GRADES.map((grade) => <option key={grade} value={grade}>Gr {grade}</option>)}
      </select>
    </label>
    <select aria-label="Subject" className={field} value={value.subject} onChange={(event) => set({ subject: event.target.value })}>
      {plan.subjects.map((subject) => <option key={subject.key} value={subject.key}>{subject.label}</option>)}
    </select>
    <input aria-label="Course title" placeholder="Course title" maxLength={200} className={field} value={value.title || ''} onChange={(event) => set({ title: event.target.value })} />
    <input aria-label="Credits" type="number" min={0} max={4} step={0.25} className={field} value={value.credits ?? 0} onChange={(event) => set({ credits: Number(event.target.value) })} />
    <select aria-label="Status" className={field} value={value.status} onChange={(event) => set({ status: event.target.value as CourseStatus })}>
      {(Object.keys(COURSE_STATUS_LABELS) as CourseStatus[]).map((status) => <option key={status} value={status}>{COURSE_STATUS_LABELS[status]}</option>)}
    </select>
    <div className="flex gap-2">
      <button type="submit" disabled={busy || !(value.title || '').trim()} className="inline-flex h-9 items-center gap-1 rounded-full bg-foreground px-3 text-sm font-semibold text-background disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}{label}
      </button>
      <button type="button" onClick={onCancel} className="h-9 rounded-full px-3 text-sm font-semibold hover:bg-muted">Cancel</button>
    </div>
    <label className="flex items-center gap-2 text-sm @lg:col-span-2">
      <input type="checkbox" checked={Boolean(value.dual_credit)} onChange={(event) => set({ dual_credit: event.target.checked })} />Dual credit
    </label>
    {value.dual_credit ? <>
      <input aria-label="College" placeholder="College" maxLength={200} className={field} value={value.dual_credit_school || ''} onChange={(event) => set({ dual_credit_school: event.target.value })} />
      <input aria-label="College credits" placeholder="College credits" type="number" min={0} max={20} step={0.5} className={field} value={value.dual_credit_credits ?? ''}
        onChange={(event) => set({ dual_credit_credits: event.target.value ? Number(event.target.value) : null })} />
    </> : null}
  </form>
}

function Tally({ plan }: { plan: Plan }) {
  const { tally } = plan
  const done = (tally.completed / tally.required) * 100
  const planned = (Math.min(tally.planned, tally.required - tally.completed) / tally.required) * 100
  return <div>
    <div className="mb-1.5 flex flex-wrap justify-between gap-2 text-sm">
      <span><b>{credits(tally.completed)}</b> completed · <b>{credits(tally.planned)}</b> planned · <b className={tally.left ? 'text-amber-700 dark:text-amber-400' : ''}>{credits(tally.left)}</b> not planned</span>
      <span className="text-muted-foreground">{tally.required} credits required</span>
    </div>
    <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${tally.completed} credits completed, ${tally.planned} planned, ${tally.left} not planned, of ${tally.required}`}>
      <div className="bg-blue-600" style={{ width: `${done}%` }} /><div className="bg-blue-300 dark:bg-blue-800" style={{ width: `${planned}%` }} />
    </div>
    <div className="mt-3">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th className="py-1.5 font-semibold">Oregon Diploma credits</th>
          {[['Required', 'Need'], ['Completed', 'Done'], ['Planned', 'Planned'], ['Left', 'Left']].map(([long, short]) => <th key={long} className="py-1.5 pl-2 text-right font-semibold">
            <span className="hidden @md:inline">{long}</span><span className="@md:hidden">{short}</span>
          </th>)}
        </tr></thead>
        <tbody>
          {tally.areas.map((area) => <tr key={area.subject} className="border-b border-border/60">
            <td className="py-1.5">{area.label}</td>
            <td className="py-1.5 pl-2 text-right tabular-nums">{credits(area.required)}</td>
            <td className="py-1.5 pl-2 text-right tabular-nums">{credits(area.completed)}</td>
            <td className="py-1.5 pl-2 text-right tabular-nums">{credits(area.planned)}</td>
            <td className={`py-1.5 pl-2 text-right tabular-nums ${area.left ? 'font-bold text-amber-700 dark:text-amber-400' : ''}`}>{credits(area.left)}</td>
          </tr>)}
          <tr className="font-bold"><td className="py-1.5">Total</td>
            {[tally.required, tally.completed, tally.planned, tally.left].map((value, index) => <td key={index} className="py-1.5 pl-2 text-right tabular-nums">{credits(value)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
    <p className="mt-1.5 text-xs text-muted-foreground">Credits past what an area needs count as electives. The transcript is the official record of credit.</p>
  </div>
}

/** What a course plan card can do: staff can also confirm courses and bring them in from Oregon CIS. */
// Type-only parameters, which the base no-unused-vars rule misreads.
// eslint-disable-next-line no-unused-vars
type PlanCall<Args extends unknown[]> = (...args: Args) => Promise<Plan>
export interface CoursePlanActions {
  add: PlanCall<[CourseWrite]>
  update: PlanCall<[string, CourseWrite]>
  remove: PlanCall<[string]>
  confirm?: PlanCall<[string, boolean]>
  importCis?: PlanCall<[]>
}

/** The course plan: the 24-credit tally, then courses by grade with adding and changing them. */
export function CoursePlanCard({ plan, onChange, actions, note }: { plan: Plan | undefined; onChange: React.Dispatch<Plan>; actions: CoursePlanActions; note: string }) {
  const [busy, setBusy] = React.useState('')
  const [editing, setEditing] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(0)
  const run = async (key: string, action: () => Promise<Plan>, done?: string) => {
    setBusy(key)
    try {
      const result = await action()
      await onChange(result)
      if (done) toast.success(done)
      return result
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t work')
      return null
    } finally {
      setBusy('')
    }
  }
  const label = (key: string) => plan?.subjects.find((subject) => subject.key === key)?.label || key

  return <Card title="Course plan" aside={plan?.cis_courses && actions.importCis ? <button type="button" disabled={Boolean(busy)} onClick={async () => { const result = await run('cis', () => actions.importCis!()); if (result) toast.success(result.added ? `Brought in ${result.added} course${result.added === 1 ? '' : 's'}` : 'Those courses are already here') }}
    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50">
    {busy === 'cis' ? <Loader2 size={13} className="animate-spin" /> : <DownloadSimple size={13} aria-hidden="true" />}Bring in from Oregon CIS
  </button> : null}>
    {!plan ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <div className="space-y-5">
      <Tally plan={plan} />
      {GRADES.map((grade) => {
        const list = plan.courses.filter((course) => course.grade === grade)
        return <div key={grade}>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-sm font-bold">Grade {grade}</h3>
            <button type="button" onClick={() => { setEditing(null); setAdding(grade) }} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
              <Plus size={12} aria-hidden="true" />Add a course
            </button>
          </div>
          {!list.length && adding !== grade ? <p className="text-sm text-muted-foreground">No courses yet.</p> : null}
          <ul className="divide-y divide-border/60">
            {list.map((course: EppCourse) => editing === course.course_uuid
              ? <li key={course.course_uuid} className="py-2"><CourseForm plan={plan} initial={course} label="Save" busy={busy === course.course_uuid} onCancel={() => setEditing(null)}
                  onSave={async (value) => { if (await run(course.course_uuid, () => actions.update(course.course_uuid, value))) setEditing(null) }} /></li>
              : <li key={course.course_uuid} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="font-semibold">{course.title}{course.dual_credit ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">dual credit{course.dual_credit_school ? `, ${course.dual_credit_school}` : ''}</span> : null}</div>
                  <div className="text-xs text-muted-foreground">{label(course.subject)} · {credits(course.credits)} credit{course.credits === 1 ? '' : 's'} · {COURSE_SOURCE_LABELS[course.source]}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${course.status === 'completed' ? 'bg-muted' : 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200'}`}>{COURSE_STATUS_LABELS[course.status]}</span>
                {course.school_confirmed && !actions.confirm
                  ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400"><Check size={12} weight="bold" aria-hidden="true" />School confirmed</span>
                  : course.school_confirmed
                  ? <button type="button" title={`Confirmed by ${course.confirmed_by?.name || 'staff'}. Select to undo.`} disabled={Boolean(busy)} onClick={() => void run(course.course_uuid, () => actions.confirm!(course.course_uuid, false))}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400"><Check size={12} weight="bold" aria-hidden="true" />School confirmed</button>
                  : course.status === 'completed' && actions.confirm
                    ? <button type="button" disabled={Boolean(busy)} onClick={() => void run(course.course_uuid, () => actions.confirm!(course.course_uuid, true), 'Confirmed')}
                      className="text-xs font-semibold underline disabled:opacity-50">Confirm</button>
                    : null}
                {course.school_confirmed && !actions.confirm ? null : <>
                <button type="button" aria-label={`Change ${course.title}`} onClick={() => { setAdding(0); setEditing(course.course_uuid) }} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><PencilSimple size={14} /></button>
                <button type="button" aria-label={`Remove ${course.title}`} disabled={Boolean(busy)} onClick={() => { if (confirm(`Remove ${course.title}?`)) void run(course.course_uuid, () => actions.remove(course.course_uuid)) }}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><Trash size={14} /></button></>}
              </li>)}
          </ul>
          {adding === grade ? <CourseForm key={`add-${grade}`} plan={plan} initial={blank(grade)} label="Add" busy={busy === 'add'} onCancel={() => setAdding(0)}
            onSave={async (value) => { if (await run('add', () => actions.add(value))) setAdding(0) }} /> : null}
        </div>
      })}
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>}
  </Card>
}

/** A supported learner's course plan on their profile, under the school record. Hidden without an active link. */
export default function CoursePlan({ userId }: { userId: number }) {
  const { orgId, token } = usePeopleContext()
  const ready = Boolean(orgId && token)
  const { data: state } = useSWR(ready ? supportKey(orgId, userId) : null, () => supportApi.status(orgId, userId, token), { revalidateOnFocus: true })
  const active = state?.status === 'active'
  const { data: plan, mutate } = useSWR(ready && active ? coursePlanKey(orgId, userId) : null, () => coursesApi.plan(orgId, userId, token), { revalidateOnFocus: false })
  if (!active) return null
  return <CoursePlanCard plan={plan} onChange={(result) => mutate(result, { revalidate: false })}
    note="Only staff can mark a completed course school confirmed. Changing a confirmed course clears it."
    actions={{
      add: (value) => coursesApi.add(orgId, userId, value, token),
      update: (courseUuid, value) => coursesApi.update(orgId, userId, courseUuid, value, token),
      remove: (courseUuid) => coursesApi.remove(orgId, userId, courseUuid, token),
      confirm: (courseUuid, confirmed) => coursesApi.confirm(orgId, userId, courseUuid, confirmed, token),
      importCis: () => coursesApi.importCis(orgId, userId, token),
    }} />
}
