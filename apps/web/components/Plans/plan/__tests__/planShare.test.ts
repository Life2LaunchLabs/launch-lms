import { describe, expect, test } from 'bun:test'
import { planShareUrl, shareNote } from '../PlanShare'

describe('plan share link', () => {
  test('points at the plan’s Discover page as a full link that keeps the organization', () => {
    const url = new URL(planShareUrl('riverside', 'goal_template_abc'))
    // Organization addresses redirect learner pages to the main site and drop the org, so the link names it in the path.
    expect(url.pathname).toBe('/orgs/riverside/discover/plans/goal_template_abc')
    expect(url.hostname.startsWith('riverside.')).toBe(false)
  })

  test('the main organization’s plans keep their plain address', () => {
    const url = planShareUrl('default', 'goal_template_abc')
    expect(url.endsWith('/discover/plans/goal_template_abc')).toBe(true)
    expect(url.includes('/orgs/')).toBe(false)
  })

  test('says what someone opening it can do', () => {
    expect(shareNote('open', 'Riverside')).toContain('join it on the way')
    expect(shareNote('request', 'Riverside')).toContain('ask to join')
    expect(shareNote('invite', 'Riverside').startsWith('Invite only')).toBe(true)
    expect(shareNote(undefined, 'Riverside').startsWith('Invite only')).toBe(true)
  })
})
