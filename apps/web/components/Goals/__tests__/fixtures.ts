import type { GoalChat } from '@services/connect/connect'
import type { Goal, Stage, Step, StepTypeKey } from '@services/goals/types'

/** A step as the API returns it, open and untouched unless told otherwise. */
export function makeStep(uuid: string, type: StepTypeKey, extra: Partial<Step> = {}): Step {
  return {
    step_uuid: uuid, stage_uuid: null, position: 0, type, title: uuid, description: '', config: {} as never, materials: [],
    completed_by: 'learner', review_required: false, start_date: null, due_date: null, held: false, after_step_uuids: [], requirement_links: [],
    status: 'not_started', locked: false, locked_reason: null, state: 'open', fraction: 0, result: null, submission: {}, answer: '',
    learner_note: '', reviewer_note: '', feedback_history: [], completed_at: null, completion_method: null, entries: [], reference: null,
    ...extra,
  }
}

function makeStage(uuid: string, position: number, title: string, steps: Step[], extra: Partial<Stage> = {}): Stage {
  return { stage_uuid: uuid, position, title, description: '', timing: '', milestone: '', start_date: null, end_date: null, steps: steps.map((step, index) => ({ ...step, stage_uuid: uuid, position: index })), ...extra }
}

const learner = { id: 7, username: 'sam', name: 'Sam Rivera' }
const coach = { id: 9, username: 'ana', name: 'Ana Ortiz' }

/**
 * A plan in the middle of its second stage: a past stage done, the current one with an open,
 * a started, a waiting, a sent-back and a locked step, a later stage not started, and a loose step.
 */
export function makeGoal(extra: Partial<Goal> = {}): Goal {
  return {
    goal_uuid: 'goal-1', title: 'Earn a nursing degree', description: 'Get into a program this fall.', icon: 'graduation',
    ownership: 'external', source: 'assignment', status: 'active', org_id: 1,
    start_date: '2026-09-01', target_date: '2026-12-18', finished_at: null, finish: {},
    owner: coach, subject: learner,
    capabilities: ['view_plan', 'update_progress'],
    progress: { done: 2, total: 9 },
    current_stage_uuid: 'stage-apply',
    schedule_warnings: [{ kind: 'step_after_stage', message: 'Send it closes after Apply ends.', stage_uuid: null, step_uuid: 'send' }],
    stages: [
      makeStage('stage-research', 0, 'Research', [
        makeStep('list', 'task', { title: 'List three programs', status: 'completed', state: 'done', fraction: 1, completed_at: '2026-09-10', result: { kind: 'items', items: [{ title: 'State U', url: '', done: true }] } }),
        makeStep('visit', 'event', { title: 'Visit a campus', status: 'completed', state: 'done', fraction: 1, config: { date: '2026-09-20', place: 'State U' } }),
      ], { start_date: '2026-09-01', end_date: '2026-10-14' }),
      makeStage('stage-apply', 1, 'Apply', [
        makeStep('essay', 'write', { title: 'Write your essay', status: 'in_progress', state: 'started', fraction: 0.5, due_date: '2026-10-30', config: { prompt: 'Why nursing?', max_words: 500 }, answer: 'Since I was small' }),
        makeStep('resume', 'upload', { title: 'Upload your resume', review_required: true, status: 'submitted', state: 'waiting', fraction: 1, config: { slots: [{ key: 'resume', label: 'Resume', kinds: ['document'] }] } }),
        makeStep('choose', 'decision', { title: 'Pick a program', status: 'changes_requested', state: 'retry', fraction: 0.5, config: { question: 'Which one?', options: [{ key: 'a', label: 'State U' }, { key: 'b', label: 'City College' }] }, feedback_history: [{ message: 'Say why.', user_id: 9, created_at: '2026-10-02' }] }),
        makeStep('send', 'task', { title: 'Send it', state: 'locked', locked: true, locked_reason: { kind: 'after', step_uuid: 'essay', title: 'Write your essay' }, after_step_uuids: ['essay'] }),
      ], { start_date: '2026-10-15', end_date: '2026-11-30' }),
      makeStage('stage-start', 2, 'Start', [
        makeStep('orientation', 'event', { title: 'Go to orientation', completed_by: 'staff', state: 'locked', locked: true, locked_reason: { kind: 'stage', title: 'Start', date: '2026-12-01' }, config: { date: '2026-12-05' } }),
      ], { start_date: '2026-12-01', end_date: '2026-12-18' }),
    ],
    unstaged_steps: [makeStep('habit', 'task', { title: 'Read for 20 minutes', status: 'in_progress', state: 'started', fraction: 0.25 })],
    ...extra,
  }
}

/** The plan's chat button counts: two messages on the essay, one on the plan's resume. */
export const goalChat: GoalChat = { goal_uuid: 'goal-1', conversation_uuid: 'chat-1', title: 'Sam and State U', can_post: true, counts: { essay: 2, resume: 1 }, count: 4 }
