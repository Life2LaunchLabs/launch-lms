import { describe, expect, test } from 'bun:test'
import type { AssignmentLearner, AssignmentStep } from '@services/assignments/assignments'
import { draftProblem, draftToSave, needLines, statusPill, stepNeeds, stepWhen } from '@services/assignments/page'
import { invitedRows, shownLearners } from '@services/assignments/people'

const counts = (done = 0, review = 0, behind = 0, open = 0, locked = 0) => ({ done, review, behind, open, locked })
const step = (over: Partial<AssignmentStep> = {}): AssignmentStep => ({
  key: 'k', title: 'Step', type: 'task', description: '', completed_by: 'learner', review_required: false, config: {}, materials: [], staff_guide: '', staff_materials: [],
  reviewer_guidance: '', start_date: null, due_date: '2026-10-04', own: false, own_dates: {}, open_early: true, allow_late: true, counts: counts(), who: { done: [], review: [], behind: [7], open: [], locked: [] }, questions: 2, ...over,
})
const learner = (name: string, done: number, review: number, needs = { questions: 0, review: 0, behind: 0 }): AssignmentLearner => ({
  person: { id: done * 10 + review, username: name, first_name: name, last_name: '' }, email: null, goal_uuid: name, goal_status: 'active', counts: counts(done, review), needs, progress_percent: 0, update_date: '',
})

describe('assignment page', () => {
  test('the pill says where it stands', () => {
    const base = { status: 'active' as const, scheduled: true, start_date: '2026-09-08', stage: { position: 1, title: 'Explore', of: 3 } }
    expect(statusPill(base, '2026-10-24')).toEqual({ text: 'Running · Stage 2 of 3', tone: 'running' })
    expect(statusPill({ ...base, start_date: '2026-11-01' }, '2026-10-24').text).toBe('Starts Nov 1')
    expect(statusPill({ ...base, status: 'paused' }).tone).toBe('paused')
  })

  test('step lines say when it opens, closes, or that it is any time', () => {
    expect(stepWhen(step(), true, '2026-10-24')).toBe('Closed Oct 4')
    expect(stepWhen(step({ start_date: '2026-10-30', due_date: '2026-11-06', allow_late: false }), true, '2026-10-24')).toBe('Opens Oct 30 · Due Nov 6 · No late work')
    expect(stepWhen(step({ type: 'event', config: { date: '2026-10-30' } }), false)).toBe('Event Oct 30')
    expect(stepWhen(step(), false)).toBe('Any time')
    expect(stepNeeds(step({ counts: counts(0, 3) }), false)).toEqual({ messages: 2, review: 3, late: [7] })
    expect(stepNeeds(step(), true).late).toEqual([])
    expect(needLines({ questions: 1, review: 0, behind: 2 }).map((line) => line.label)).toEqual(['question', 'learners past due'])
  })

  test('a schedule needs an end and stages in order, and saves whole', () => {
    const draft = { start: '2026-09-08', end: '', stages: { a: '2026-09-08', b: '2026-10-05' }, steps: { x: { due_date: '2026-10-01', allow_late: false } } }
    expect(draftProblem(draft)).toContain('last day')
    expect(draftProblem({ ...draft, end: '2026-12-18', stages: { a: '2026-10-05', b: '2026-09-08' } })).toBe('Stages start in order.')
    expect(draftToSave({ ...draft, end: '2026-12-18' })).toEqual({ start_date: '2026-09-08', due_date: '2026-12-18',
      stages: [{ stage_key: 'a', start_date: '2026-09-08' }, { stage_key: 'b', start_date: '2026-10-05' }],
      steps: [{ step_key: 'x', start_date: null, due_date: '2026-10-01', open_early: true, allow_late: false }] })
  })

  test('people filter by what they need and sort by name or progress', () => {
    const rows = [learner('Cy', 2, 0), learner('Ab', 5, 0, { questions: 1, review: 0, behind: 0 }), learner('Bo', 2, 3, { questions: 0, review: 3, behind: 0 }),
      { ...learner('x', 0, 0), person: null, email: 'x@y.z' }]
    expect(shownLearners(rows, 'all', 'az').map((row) => row.goal_uuid)).toEqual(['Ab', 'Bo', 'Cy'])
    expect(shownLearners(rows, 'all', 'most').map((row) => row.goal_uuid)).toEqual(['Ab', 'Bo', 'Cy'])
    expect(shownLearners(rows, 'all', 'least').map((row) => row.goal_uuid)).toEqual(['Cy', 'Bo', 'Ab'])
    expect(shownLearners(rows, 'review', 'az').map((row) => row.goal_uuid)).toEqual(['Bo'])
    expect(shownLearners(rows, 'needs', 'za').map((row) => row.goal_uuid)).toEqual(['Bo', 'Ab'])
    expect(shownLearners(rows, 'all', 'az', ' bo ').map((row) => row.goal_uuid)).toEqual(['Bo'])
    expect(invitedRows(rows).map((row) => row.email)).toEqual(['x@y.z'])
  })
})
