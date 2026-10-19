'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Loader2, Lock, Settings2 } from 'lucide-react'
import { useSWRConfig } from 'swr'
import { useRouter } from 'next/navigation'
import { Button } from '@components/ui/button'
import { GoalEditingProvider, useGoalEditing } from '@components/Goals/edit/GoalEditing'
import { GoalChatProvider } from '@components/Goals/chat/GoalChat'
import GoalPath from '@components/Goals/learner/GoalPath'
import useGoalColors from '@components/Goals/learner/useGoalColors'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { goalAdminApi, type StaffNoteView } from '@services/goals/admin'
import { goalUrl } from '@services/goals/goals'
import { can, type Goal, type Step } from '@services/goals/types'
import { dateTime, personName, REVIEW_CAPABILITY } from './ui'

/** The learner's path as staff work it: the learner's own view of it, with staff controls on each card, staff notes under the open one, and each step and stage edited from its own menu. */
export default function StaffGoalPath({ goal, orgslug, orgId, token, viewerUserId, header }: {
  goal: Goal; orgslug: string; orgId: number; token?: string; viewerUserId?: number
  /** Above the path, inside its editing and chat: the plan's header card. */
  header?: (color: string) => React.ReactNode // eslint-disable-line no-unused-vars
}) {
  const router = useRouter()
  const { getGoalColor, setGoalColor } = useGoalColors(React.useMemo(() => [goal], [goal]), viewerUserId)
  const color = getGoalColor(goal.goal_uuid)
  // A plan tagged in the chat opens here too, from the staff side.
  const openPlan = (goalUuid: string, stepUuid?: string) => router.push(`${getUriWithOrg(orgslug, routePaths.org.dash.livePlan(goalUuid))}${stepUuid ? `#step-${stepUuid}` : ''}`)
  return <GoalEditingProvider goal={goal} token={token} color={color} setColor={(next: string) => setGoalColor(goal.goal_uuid, next)}>
    <GoalChatProvider scope={{ goal }} token={token} orgslug={orgslug} staffOrgId={orgId} onOpenPlan={openPlan}>
      {header?.(color)}
      <StaffPath goal={goal} orgslug={orgslug} orgId={orgId} token={token} viewerUserId={viewerUserId} color={color} intro={!header} />
    </GoalChatProvider>
  </GoalEditingProvider>
}

/**
 * The learner's path from the staff side: the same GoalPath they see, opened at the step they'd
 * do next, with staff notes under the open step for whoever reviews the goal.
 */
function StaffPath({ goal, orgslug, orgId, token, viewerUserId, color, intro }: { goal: Goal; orgslug: string; orgId: number; token?: string; viewerUserId?: number; color: string; intro: boolean }) {
  const [selected, setSelected] = React.useState('')
  const editing = useGoalEditing()
  React.useEffect(() => {
    const hash = window.location.hash.replace('#step-', '')
    if (hash) setSelected(hash)
  }, [])
  const reviewer = can(goal, REVIEW_CAPABILITY)
  return <div className="mx-auto max-w-3xl space-y-6">
    {intro ? <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-black text-gray-950">Steps</h2><p className="mt-1 text-sm text-gray-500">The same path the learner sees. Open a step to review it, sign it off or leave a staff note; change one from its menu.</p></div>
      {editing ? <Button type="button" variant="surface" onClick={() => editing.open({ kind: 'settings' })}><Settings2 size={15} aria-hidden="true" />Goal settings</Button> : null}
    </div> : null}
    <GoalPath goal={goal} color={color} perspective="staff" viewer={{ orgslug, token, viewerUserId }} selectedUuid={selected} onSelect={setSelected}
      onOpenActivity={() => toast('Activities open in the learner’s own view. Grade their answers from Reviews.')}
      rowExtra={reviewer ? (step, row) => row.selected ? <div className="mt-3"><StaffNotes goal={goal} step={step} orgId={orgId} token={token} /></div> : null : undefined} />
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
