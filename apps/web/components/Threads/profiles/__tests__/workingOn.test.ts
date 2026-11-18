import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProfilePlan } from '@services/school/people'
import { workingOn } from '@components/Threads/profiles/workingOn'

// bun test runs from apps/web.
const source = readFileSync(join(process.cwd(), 'components', 'Threads', 'profiles', 'PersonProfile.tsx'), 'utf8')
const now = new Date('2026-11-16T12:00:00Z')
const plan = (status: string, done: number, finished_at: string | null = null): ProfilePlan => ({
  goal_uuid: `goal_${status}_${done}`, title: 'Education plan', status, source: 'assignment',
  progress: { done, total: 4, submitted: 0, behind: 0 }, assignment_uuid: 'assignment_1', assignment_status: null, finished_at,
})

describe('profile Working on (FEED-223)', () => {
  test('a learner partway through an assigned plan shows it', () => {
    const partway = plan('active', 3)
    expect(workingOn([partway], now)).toEqual({ current: [partway], finished: [] })
    expect(workingOn([plan('pending', 0)], now).current).toHaveLength(1)
  })

  test('approving the last hand-in finishes the plan, and it stays under Working on', () => {
    const justFinished = plan('finished', 4, '2026-11-16T05:30:00')
    expect(workingOn([justFinished], now)).toEqual({ current: [], finished: [justFinished] })
  })

  test('plans in progress come first, and long-finished plans leave Working on', () => {
    const partway = plan('active', 2)
    expect(workingOn([plan('finished', 4, '2026-11-15T00:00:00'), partway], now)).toEqual({ current: [partway], finished: [] })
    expect(workingOn([plan('finished', 4, '2026-09-01T00:00:00')], now)).toEqual({ current: [], finished: [] })
    expect(workingOn([], now)).toEqual({ current: [], finished: [] })
  })

  test('the profile uses it', () => {
    expect(source).toContain('workingOn(profile.plans)')
    expect(source).toContain('recently finished')
  })
})
