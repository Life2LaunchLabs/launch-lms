import { describe, expect, test } from 'bun:test'
import { planShareUrl, shareNote } from '../PlanShare'

describe('plan share link', () => {
  test('points at the plan’s Discover page as a full link', () => {
    const url = planShareUrl('riverside', 'goal_template_abc', 'https://riverside.example.app')
    expect(url.startsWith('http')).toBe(true)
    expect(url.endsWith('/discover/plans/goal_template_abc')).toBe(true)
  })

  test('says what someone opening it can do', () => {
    expect(shareNote('open', 'Riverside')).toContain('join it on the way')
    expect(shareNote('request', 'Riverside')).toContain('ask to join')
    expect(shareNote('invite', 'Riverside').startsWith('Invite only')).toBe(true)
    expect(shareNote(undefined, 'Riverside').startsWith('Invite only')).toBe(true)
  })
})
