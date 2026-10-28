import type { AssignmentDetail, AssignmentStep, ScheduleSave } from './assignments'
import { shortDate, type StepDates } from './status'

export const todayIso = () => new Date().toISOString().slice(0, 10)
const day = (value?: string | null) => (value ? value.slice(0, 10) : '')

export type PillTone = 'running' | 'soon' | 'paused' | 'ended'

/** The assignment's state as the pill under its title says it: "Running · Stage 2 of 3", "Starts Oct 26", "Paused", "Ended". */
export function statusPill(detail: Pick<AssignmentDetail, 'status' | 'scheduled' | 'start_date' | 'stage'>, today = todayIso()): { text: string; tone: PillTone } {
  if (detail.status === 'ended') return { text: 'Ended', tone: 'ended' }
  if (detail.status === 'paused') return { text: 'Paused', tone: 'paused' }
  if (detail.scheduled && detail.start_date && day(detail.start_date) > today) return { text: `Starts ${shortDate(detail.start_date)}`, tone: 'soon' }
  return { text: detail.stage && detail.stage.of > 1 ? `Running · Stage ${detail.stage.position + 1} of ${detail.stage.of}` : 'Running', tone: 'running' }
}

/** "Sep 8 – Dec 18", or when a self-paced one started and its end, if any. */
export function dateRange(detail: Pick<AssignmentDetail, 'scheduled' | 'start_date' | 'due_date' | 'creation_date'>) {
  const start = shortDate(detail.start_date || detail.creation_date)
  return `${start} – ${detail.due_date ? shortDate(detail.due_date) : detail.scheduled ? '' : 'No end date'}`
}

/** A step's dates under its title: "Opens Oct 30 · Due Nov 6", "Closed Oct 4", "Event Oct 30", "Any time". */
export function stepWhen(step: AssignmentStep, scheduled: boolean, today = todayIso()) {
  const event = step.type === 'event' ? (step.config?.date as string | undefined) : undefined
  if (!scheduled && !step.own) return event ? `Event ${shortDate(event)}` : 'Any time'
  const bits: string[] = []
  const start = day(step.start_date)
  if (start && start > today) bits.push(`Opens ${shortDate(start)}`)
  else if (start && step.own_dates.start_date) bits.push(`Started ${shortDate(start)}`)
  if (event) bits.push(`Event ${shortDate(event)}`)
  else if (step.due_date) bits.push(`${day(step.due_date) < today ? 'Closed' : 'Due'} ${shortDate(step.due_date)}`)
  if (!step.allow_late) bits.push('No late work')
  return bits.join(' · ')
}

/** What waits on staff on one step: learners' messages about it, work to review, and who is past due. */
export function stepNeeds(step: AssignmentStep, ended: boolean) {
  return { messages: step.questions || 0, review: step.counts.review, late: ended ? [] : step.who.behind || [] }
}

/** The needs card's lines: questions, ready to review, learners past due, leaving out what's zero. */
export function needLines(needs: AssignmentDetail['needs']) {
  return [
    { key: 'questions' as const, count: needs.questions, label: needs.questions === 1 ? 'question' : 'questions' },
    { key: 'review' as const, count: needs.review, label: 'ready to review' },
    { key: 'behind' as const, count: needs.behind, label: needs.behind === 1 ? 'learner past due' : 'learners past due' },
  ].filter((line) => line.count > 0)
}

/** The schedule being edited: the assignment's start and end, each stage's start, and steps' own dates. */
export interface ScheduleDraft { start: string; end: string; stages: Record<string, string>; steps: Record<string, StepDates> }

export function scheduleDraft(detail: AssignmentDetail): ScheduleDraft {
  const stages: Record<string, string> = {}
  const steps: Record<string, StepDates> = {}
  for (const stage of detail.stages) {
    stages[stage.key] = detail.scheduled ? day(stage.start_date) : ''
    for (const step of stage.steps) if (Object.keys(step.own_dates || {}).length) steps[step.key] = { ...step.own_dates, start_date: day(step.own_dates.start_date) || null, due_date: day(step.own_dates.due_date) || null }
  }
  return { start: day(detail.start_date), end: day(detail.due_date), stages, steps }
}

/** What's wrong with a draft, if anything, before it's saved. */
export function draftProblem(draft: ScheduleDraft) {
  const starts = Object.values(draft.stages).filter(Boolean)
  const scheduled = starts.length > 0 || Object.values(draft.steps).some((dates) => dates.start_date || dates.due_date)
  if (scheduled && !draft.end) return 'Pick a last day; a schedule needs an end.'
  const first = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : draft.start
  if (draft.end && first && draft.end < first) return 'The last day comes before it starts.'
  const ordered = Object.values(draft.stages).filter(Boolean)
  if (ordered.some((value, index) => index > 0 && value < ordered[index - 1])) return 'Stages start in order.'
  return ''
}

/** The draft as the schedule endpoint saves it, all at once. */
export function draftToSave(draft: ScheduleDraft): ScheduleSave {
  const starts = Object.values(draft.stages).filter(Boolean)
  return {
    start_date: starts[0] || draft.start || null,
    due_date: draft.end || null,
    stages: Object.entries(draft.stages).filter(([, value]) => value).map(([stage_key, start_date]) => ({ stage_key, start_date })),
    steps: Object.entries(draft.steps).filter(([, dates]) => dates.start_date || dates.due_date || dates.open_early === false || dates.allow_late === false)
      .map(([step_key, dates]) => ({ step_key, start_date: dates.start_date || null, due_date: dates.due_date || null, open_early: dates.open_early !== false, allow_late: dates.allow_late !== false })),
  }
}
