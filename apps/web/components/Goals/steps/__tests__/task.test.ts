import { describe, expect, test } from 'bun:test'
import { asksQuestion } from '@components/Goals/steps/task'
import type { Step } from '@services/goals/types'

const task = (title: string, description = '', config: Step<'task'>['config'] = {}) => ({ title, description, config })

describe('a task that asks a question', () => {
  test('a question in the title or at the end of a line of the description gets an answer box', () => {
    expect(asksQuestion(task('Which one sounds cooler?'))).toBe(true)
    expect(asksQuestion(task('Talk to Mom', 'Pilot or chef?\nTell her why.'))).toBe(true)
  })

  test('a plain task does not, unless the builder asks for an answer', () => {
    expect(asksQuestion(task('Tidy up', 'Is it done? Mostly. Do the desk too.'))).toBe(false)
    expect(asksQuestion(task('Tidy up', '', { ask: true }))).toBe(true)
  })
})
