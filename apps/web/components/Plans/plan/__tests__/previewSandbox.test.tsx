import { expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SWRConfig } from 'swr'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import GoalPath from '@components/Goals/learner/GoalPath'
import { applyWork, finishedStatus, previewGoal, type PreviewWork } from '@components/Plans/plan/previewSandbox'
import type { TemplateDocument } from '@services/goals/types'

// Preview builds the plan as someone assigned it would get it, in the browser, and keeps what the
// viewer does there to itself: these pin how its locks follow the plan and that work stays local.

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }

const document: TemplateDocument = {
  format: 'launch-lms.goal-template', format_version: 1,
  template: { title: 'Forklift certification', description: 'Get cleared to drive on the floor.' },
  stages: [
    { key: 'learn', title: 'Learn', steps: [
      { key: 'video', type: 'task', title: 'Watch the safety video', config: {} as never, completed_by: 'learner' },
      { key: 'quiz', type: 'write', title: 'Answer the safety questions', config: {} as never, completed_by: 'learner', review_required: true, after: ['video'] },
    ] },
    { key: 'drive', title: 'Drive', steps: [
      { type: 'task', title: 'Drive the course with a trainer', config: {} as never, completed_by: 'staff' },
    ] },
  ],
}

const build = (work: PreviewWork = {}, stageIndex = 0) => previewGoal({ document, orgId: 1, icon: null, work, stageIndex })

test('a fresh preview opens on the first stage, with steps waiting on others and later stages closed', () => {
  const goal = build()
  const [video, quiz] = goal.stages[0].steps
  const [drive] = goal.stages[1].steps
  expect(goal.current_stage_uuid).toBe(goal.stages[0].stage_uuid)
  expect(video.state).toBe('open')
  expect(quiz.locked_reason).toEqual({ kind: 'after', step_uuid: video.step_uuid, title: 'Watch the safety video' })
  expect(drive.locked_reason).toEqual({ kind: 'stage', title: 'Drive', date: null })
  expect(goal.progress).toEqual({ done: 0, total: 3 })
  // It can be read and nothing more, so the shared path's own controls never reach the API.
  expect(goal.capabilities).toEqual(['view_plan'])
})

test('finishing a step unlocks the next; one needing review waits for it and still unlocks what follows', () => {
  let work = applyWork({}, 'video', { kind: 'status', status: 'completed' })
  let goal = build(work)
  expect(goal.stages[0].steps[0].state).toBe('done')
  expect(goal.stages[0].steps[1].state).toBe('open')
  expect(goal.progress.done).toBe(1)
  work = applyWork(work, 'quiz', { kind: 'status', status: finishedStatus({ review_required: true }, 'completed') })
  goal = build(work)
  expect(goal.stages[0].steps[1].state).toBe('waiting')
})

test('moving the preview to a later stage opens its steps', () => {
  expect(build({}, 1).stages[1].steps[0].locked).toBe(false)
  expect(build({}, 9).current_stage_uuid).toBe(build({}, 1).stages[1].stage_uuid)
})

test('answers and entries stay in the preview and start the step', () => {
  let work = applyWork({}, 'quiz', { kind: 'submission', answer: 'Check the forks first.' })
  work = applyWork(work, 'video', { kind: 'add-entry', entry: { kind: 'note', title: 'Notes' } })
  const entry = work.video.entries[0]
  work = applyWork(work, 'video', { kind: 'update-entry', entryUuid: entry.entry_uuid, data: { done: true } })
  expect([work.quiz.answer, work.quiz.status]).toEqual(['Check the forks first.', 'in_progress'])
  expect([work.video.entries[0].title, work.video.entries[0].done]).toEqual(['Notes', true])
  expect(applyWork(work, 'video', { kind: 'delete-entry', entryUuid: entry.entry_uuid }).video.entries).toEqual([])
})

test('the preview renders on the learner’s own path', () => {
  const goal = build()
  const html = renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>
    <SWRConfig value={{ provider: () => new Map() }}>
      <GoalPath goal={goal} color="blue" perspective="learner" viewer={{ orgslug: 'school' }} selectedUuid="" onSelect={() => {}} stepBody={() => <p>card</p>} />
    </SWRConfig>
  </AppRouterContext.Provider>)
  expect(html).toContain('Watch the safety video')
  expect(html).toContain('Drive the course with a trainer')
  expect(html).toContain('Opens when the goal moves on to it')
  expect(html).toContain('<p>card</p>')
})
