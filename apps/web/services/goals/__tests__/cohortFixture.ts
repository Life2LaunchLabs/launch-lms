/** An assignment matrix for tests: three stages, three learners, a step of each kind staff act on. */
import type { AssignmentMatrix, ColumnAggregate, MatrixCell, MatrixColumn, MatrixLearner } from '../admin'

export function aggregate(extra: Partial<ColumnAggregate> = {}): ColumnAggregate {
  return {
    learner_count: 3, completed_count: 0, excused_count: 0, review_count: 0, done_count: 0, handed_in_count: 0, to_grade_count: 0, not_handed_in_count: 0, needs_settle_count: 0,
    buckets: { done: [], handed_in: [], to_grade: [], not_handed_in: [], needs_settle: [] }, ...extra,
  }
}

export function column(key: string, extra: Partial<MatrixColumn> = {}): MatrixColumn {
  return { template_key: key, title: key, type: 'task', description: '', completed_by: 'learner', review_required: false, config: {}, materials: [], reviewer_guidance: '', aggregate: aggregate(), due_date: null, due_set: false, ...extra }
}

export function cell(extra: Partial<MatrixCell> = {}): MatrixCell {
  return { step_uuid: 'x', status: 'not_started', bucket: null, locked: false, locked_reason: null, held: false, due_date: null, fraction: 0, learner_note: '', completed_at: null, last_reminded_at: null, ...extra }
}

export function learner(id: number, cells: Record<string, MatrixCell>, extra: Partial<MatrixLearner> = {}): MatrixLearner {
  return { id, user_uuid: `user_${id}`, first_name: `L${id}`, goal_uuid: `goal_${id}`, status: 'active', progress_percent: 0, capabilities: [], custom_steps: [], cells, people: [], ...extra }
}

/** Explore is over (survey done by all, values late for one), Plan is on (résumé handed in, a fair to settle), Apply is ahead. */
export function matrix(): AssignmentMatrix {
  const survey = column('survey', { aggregate: aggregate({ done_count: 3 }) })
  const values = column('values', { aggregate: aggregate({ done_count: 2, not_handed_in_count: 1, buckets: { done: ['user_1', 'user_2'], handed_in: [], to_grade: [], not_handed_in: ['user_3'], needs_settle: [] } }) })
  const fair = column('fair', { type: 'event', completed_by: 'staff', aggregate: aggregate({ needs_settle_count: 3, buckets: { done: [], handed_in: [], to_grade: [], not_handed_in: [], needs_settle: ['user_1', 'user_2', 'user_3'] } }) })
  const resume = column('resume', { type: 'upload', review_required: true, reviewer_guidance: 'One page', aggregate: aggregate({ handed_in_count: 1, to_grade_count: 1 }) })
  const apps = column('apps', { type: 'activity', config: { activity_uuid: 'learning_activity_1' } })
  return {
    assignment: { assignment_uuid: 'a1', template_title: 'College & Career Launch', start_date: '2026-09-08', due_date: '2027-01-04', staff_user_ids: [9] } as never,
    assignments: [], cohort: null, version: 2,
    stages: [
      { stage_key: 'explore', title: 'Explore', position: 0, start_date: '2026-09-08', due_date: '2026-10-02', steps: [survey, values] },
      { stage_key: 'plan', title: 'Plan', position: 1, start_date: '2026-10-05', due_date: '2026-11-06', steps: [fair, resume] },
      { stage_key: 'apply', title: 'Apply', position: 2, start_date: '2026-11-09', due_date: '2027-01-04', steps: [apps] },
    ],
    learners: [
      learner(1, { survey: cell({ status: 'completed' }), values: cell({ status: 'completed' }), resume: cell({ status: 'submitted', bucket: 'handed_in', due_date: '2026-10-22' }), apps: cell({ status: 'completed' }) }),
      learner(2, { survey: cell({ status: 'completed' }), values: cell({ status: 'completed' }), resume: cell({ status: 'changes_requested', due_date: '2026-10-22' }) }, { people: [{ id: 9, first_name: 'Ms.', last_name: 'Rivera', role: 'Staff' }, { id: 12, first_name: 'Pat', role: 'Guardian' }] }),
      learner(3, { survey: cell({ status: 'completed' }), values: cell({ due_date: '2026-10-02', last_reminded_at: '2026-10-19T10:00:00Z' }), resume: cell({ due_date: '2026-10-22' }), apps: cell() }),
    ],
  }
}
