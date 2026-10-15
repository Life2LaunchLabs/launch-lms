'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Loader2, Lock, Pencil } from 'lucide-react'
import { useSWRConfig } from 'swr'
import { Button } from '@components/ui/button'
import GoalEditMode from '@components/Goals/edit/GoalEditMode'
import { GoalStepRow, type PathViewer } from '@components/Goals/learner/GoalStepRow'
import useGoalColors from '@components/Goals/learner/useGoalColors'
import { planVars } from '@components/Goals/planColors'
import { goalAdminApi, type StaffNoteView } from '@services/goals/admin'
import { goalUrl } from '@services/goals/goals'
import { goalSteps, type Goal, type Step } from '@services/goals/types'
import { dateTime, personName, REVIEW_CAPABILITY } from './ui'

/** The learner's path as staff work it: cards open in place, staff notes under each, and the structure editor. */
export default function StaffGoalPath({ goal, orgslug, orgId, token, viewerUserId }: { goal: Goal; orgslug: string; orgId: number; token?: string; viewerUserId?: number }) {
  const [selected, setSelected] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState(false)
  const { getGoalColor, setGoalColor } = useGoalColors(React.useMemo(() => [goal], [goal]), viewerUserId)
  const color = getGoalColor(goal.goal_uuid)
  React.useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash.replace('#step-', '') : ''
    if (hash) setSelected(hash)
  }, [])
  const canEdit = goal.capabilities.includes('edit_structure') || goal.capabilities.includes('edit_plan_details')
  const reviewer = goal.capabilities.includes(REVIEW_CAPABILITY)
  const viewer: PathViewer = { orgslug, token, viewerUserId, canWork: false, staff: reviewer }
  const goTo = (stepUuid: string) => { setSelected(stepUuid); document.getElementById(`step-${stepUuid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  const openActivity = () => toast('Activities open in the learner’s own view. Grade their answers from Reviews.')

  if (editing) return <div data-plan="" style={planVars(color)} className="mx-auto max-w-3xl">
    <GoalEditMode goal={goal} orgslug={orgslug} token={token} color={color} setColor={(next: string) => setGoalColor(goal.goal_uuid, next)} onDone={() => setEditing(false)} />
  </div>

  const groups = [...goal.stages.map((stage) => ({ key: stage.stage_uuid, title: stage.title, due: stage.due_date, steps: stage.steps })), ...(goal.unstaged_steps.length ? [{ key: 'unstaged', title: goal.stages.length ? 'Other steps' : '', due: null, steps: goal.unstaged_steps }] : [])]
  return <div data-plan="" style={planVars(color)} className="mx-auto max-w-3xl space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-black text-gray-950">Steps</h2><p className="mt-1 text-sm text-gray-500">The same path the learner sees. Open a step to review it, sign it off or leave a staff note.</p></div>
      {canEdit ? <Button type="button" variant="surface" onClick={() => setEditing(true)}><Pencil size={15} aria-hidden="true" />Edit steps</Button> : null}
    </div>
    {!goalSteps(goal).length ? <p className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">This goal has no steps yet.</p> : null}
    {groups.map((group) => <section key={group.key}>
      {group.title ? <div className="mb-3 flex items-end gap-3"><h3 className="text-sm font-black uppercase tracking-[0.12em]">{group.title}</h3><p className="text-xs text-muted-foreground">{group.steps.length} step{group.steps.length === 1 ? '' : 's'}</p></div> : null}
      <ol className="flex flex-col">{group.steps.map((step, index) => <React.Fragment key={step.step_uuid}>
        <GoalStepRow goal={goal} step={step} viewer={viewer} selected={selected === step.step_uuid} last={index === group.steps.length - 1} onSelect={() => setSelected(selected === step.step_uuid ? null : step.step_uuid)} onGoTo={goTo} onOpenActivity={openActivity} />
        {selected === step.step_uuid && reviewer ? <li className="mb-4 ml-[72px]"><StaffNotes goal={goal} step={step} orgId={orgId} token={token} /></li> : null}
      </React.Fragment>)}</ol>
    </section>)}
  </div>
}

/** Notes between staff on one step; learners never see these. */
export function StaffNotes({ goal, step, orgId, token, initial }: { goal: Goal; step: Pick<Step, 'step_uuid' | 'staff_notes'>; orgId: number; token?: string; initial?: StaffNoteView[] }) {
  const { mutate } = useSWRConfig()
  const [notes, setNotes] = React.useState<StaffNoteView[]>(initial || (step.staff_notes || []) as StaffNoteView[])
  const [draft, setDraft] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => { setNotes(initial || (step.staff_notes || []) as StaffNoteView[]) }, [initial, step.staff_notes])
  const save = async () => {
    if (!draft.trim()) return
    setSaving(true)
    try {
      const result = await goalAdminApi.addStaffNote(orgId, step.step_uuid, draft, token)
      setNotes(result.staff_notes)
      setDraft('')
      void mutate(goalUrl(goal.goal_uuid))
    } catch (error: any) { toast.error(error?.message || 'Could not save the note.') } finally { setSaving(false) }
  }
  return <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
    <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900"><Lock size={12} />Staff notes · learners never see these</p>
    {notes.map((note, index) => <p key={note.note_uuid || index} className="text-xs leading-5 text-gray-900"><strong>{note.author ? personName(note.author) : 'Staff'}:</strong> {note.message} <span className="text-[10px] text-gray-500">{dateTime(note.created_at)}</span></p>)}
    <div className="flex gap-1.5">
      <label className="sr-only" htmlFor={`staff-note-${step.step_uuid}`}>Add a staff note</label>
      <input id={`staff-note-${step.step_uuid}`} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void save() }} placeholder="Add a staff note" className="h-8 min-w-0 flex-1 rounded-md border border-amber-200 bg-white px-2 text-xs" />
      <button type="button" onClick={() => void save()} disabled={!draft.trim() || saving} className="h-8 rounded-md bg-amber-900 px-2.5 text-xs font-bold text-white disabled:opacity-40">{saving ? <Loader2 size={12} className="animate-spin" /> : 'Add'}</button>
    </div>
  </div>
}
