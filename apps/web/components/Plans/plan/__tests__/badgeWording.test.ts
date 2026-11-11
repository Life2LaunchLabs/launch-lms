import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { awardedWhen, earnedBy, needsReview } from '@components/Plans/plan/badgeWording'

// bun test runs from apps/web.
const source = readFileSync(join(process.cwd(), 'components', 'Plans', 'plan', 'PlanBadgeCard.tsx'), 'utf8')
const step = (review_required = false) => ({ type: 'task', title: 'Step', config: {}, completed_by: 'subject', review_required }) as never
const plan = (...reviews: boolean[]) => ({ stages: [{ title: 'Stage', steps: reviews.map(step) }] })

describe('badge wording (FEED-88)', () => {
  test('a plan with no reviewed steps is awarded when every step is finished', () => {
    expect(needsReview(plan(false, false))).toBe(false)
    expect(awardedWhen(plan(false))).toBe('Awarded when a learner finishes every step.')
    expect(earnedBy(plan(false), 'CPR')).toBe('Earned by finishing every step of CPR')
  })

  test('a step that needs review says the badge waits for approval', () => {
    expect(needsReview(plan(false, true))).toBe(true)
    expect(awardedWhen(plan(false, true))).toBe('Awarded when every step is done and approved.')
    expect(earnedBy(plan(true), 'CPR')).toBe('Earned when every step of CPR is done and approved')
    expect(needsReview(null)).toBe(false)
  })

  test('the main badge rows show plain labels, and Open Badges keys only under More Open Badge fields', () => {
    for (const key of ['achievementType', 'criteria.narrative', 'criteria.id', "spec: 'tag'", "spec: 'style'"]) expect(source).not.toContain(key)
    expect(source).toContain('{extra.spec}')
    expect(source).not.toContain('{row.spec}')
  })
})
