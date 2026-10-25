import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AwardPage from '@components/Badges/AwardPage'
import { certificateFileName } from '@components/Badges/awardSharing'
import type { BadgeAward } from '@services/badges/badges'

const award = {
  award_uuid: 'award_1', code: 'K7M2Q9XB', template_uuid: 't1', semver: '1.0.0', source: 'plan_completion', earned_on: '2026-10-20', issued_at: '2026-10-20T12:00:00',
  achievement: { template_uuid: 't1', name: 'Launch Ready', kind: 'Badge', image_url: '', skills: ['Teamwork'], style: 'modern', description: 'Ready to launch.', criteria_narrative: '', creator: null },
  statement: '', evidence_url: '', awarded_by: null, learner: { id: 9, user_uuid: 'user_9', username: 'maya', name: 'Maya Rivera' },
  issuing_org: { id: 1, org_uuid: 'org_1', slug: 'riverside', name: 'Riverside', logo_image: null },
  status: 'active', revoked_at: null, revoked_reason: '', signed: true,
} as unknown as BadgeAward
const page = (values: Partial<BadgeAward> = {}, check = { verified: true, proof: true, revoked: false }) =>
  renderToStaticMarkup(<AwardPage orgslug="riverside" award={{ ...award, ...values }} check={check} pageUrl="https://riverside.example/b/K7M2Q9XB" />)

describe('a badge award’s public page', () => {
  test('shows who earned it, verified, with the PDF and Open Badge downloads and how it’s earned', () => {
    const html = page()
    expect(html).toContain('Maya Rivera earned Launch Ready')
    expect(html).toContain('Verified Open Badge')
    expect(html).toContain('Download PDF')
    expect(html).toContain('Download Open Badge')
    expect(html).toContain('How it&rsquo;s earned'.replace('&rsquo;', '’'))
    expect(html).toContain('Not revoked')
    expect(html).toContain('K7M2Q9XB')
    expect(html).not.toContain('equivalent work')
  })

  test('a direct award says it was for equivalent work, with the sign-off', () => {
    const html = page({ source: 'direct_award', statement: 'Ran the summer project', awarded_by: { id: 2, name: 'Sam Staff' } })
    expect(html).toContain('Awarded for equivalent work')
    expect(html).toContain('Sam Staff at Riverside signed off')
    expect(html).toContain('Ran the summer project')
  })

  test('a revoked award says so and offers nothing to share', () => {
    const html = page({ status: 'revoked', revoked_at: '2026-10-22T09:00:00', revoked_reason: 'Awarded by mistake' }, { verified: false, proof: true, revoked: true })
    expect(html).toContain('Riverside revoked this badge')
    expect(html).toContain('Awarded by mistake')
    expect(html).toContain('Revoked by the issuer')
    expect(html).not.toContain('Download PDF')
    expect(html).not.toContain('Verified Open Badge')
  })

  test('names the PDF after the badge and who earned it', () => {
    expect(certificateFileName({ ...award, achievement: { ...award.achievement, name: 'Launch: Ready/Set' } })).toBe('Launch ReadySet - Maya Rivera.pdf')
  })
})
