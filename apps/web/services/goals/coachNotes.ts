import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import { goalUrl } from './goals'

/** Something the learner can do about a note. Coach never acts on the goal itself. */
export type CoachNoteAction = {
  id: string
  kind: 'ask' | 'session' | 'step' | 'dismiss'
  label: string
  /** ask and session: what the learner says to Coach to begin. */
  prompt?: string
  step_uuid?: string
}

/** What Coach noticed on one goal at a check-in. */
export type CoachNote = {
  note_uuid: string
  goal_uuid: string
  goal_title: string
  kind: string
  title: string
  body: string
  actions: CoachNoteAction[]
  status: 'open' | 'acted' | 'dismissed' | 'expired'
  created_at: string
}

export type GoalCoachNotes = { notes: CoachNote[]; cadence: 'weekly' | 'monthly'; next_check_in_at: string | null }

export const coachNotesUrl = (goalUuid: string) => goalUrl(goalUuid, '/coach-notes')

/** Records the learner's choice on a note; the caller runs the returned action. */
export async function actOnCoachNote(goalUuid: string, noteUuid: string, actionId: string, token?: string): Promise<{ note: CoachNote; action: CoachNoteAction }> {
  const response = await fetch(`${coachNotesUrl(goalUuid)}/${encodeURIComponent(noteUuid)}/act`, RequestBodyWithAuthHeader('POST', { action_id: actionId }, null, token))
  return errorHandling(response)
}

/** When Coach checks in next, as a short line. */
export function checkInLine(notes: Pick<GoalCoachNotes, 'cadence' | 'next_check_in_at'>, today = new Date()) {
  const cadence = notes.cadence === 'monthly' ? 'monthly' : 'weekly'
  const next = notes.next_check_in_at ? new Date(`${notes.next_check_in_at}${/[Zz]|[+-]\d\d:\d\d$/.test(notes.next_check_in_at) ? '' : 'Z'}`) : null
  if (!next || Number.isNaN(next.getTime())) return `Coach checks in ${cadence}`
  const day = next <= today ? 'soon' : next.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `Coach checks in ${cadence} · next ${day}`
}
