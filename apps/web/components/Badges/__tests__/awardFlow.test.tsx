import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WhoStep } from '@components/Assignments/assign/FlowSteps'
import { BadgeChooser, Review, SignOff } from '@components/Badges/award/AwardFlow'
import type { AwardablePlan } from '@services/badges/badges'

const plan: AwardablePlan = {
  template_uuid: 't1', name: 'Launch Ready', kind: 'Badge', image_url: '', skills: [], style: 'modern', description: '', title: 'Launch Ready plan',
  thumbnail_image: '', steps: 6, owned: true, owner: { name: 'Riverside', slug: 'riverside' },
}
const maya = { kind: 'member' as const, id: 9, name: 'Maya Rivera', username: 'maya' }
const noop = () => {}

describe('awarding a badge directly', () => {
  test('lists the badges it may award, saying whose plan each is', () => {
    const html = renderToStaticMarkup(<BadgeChooser plans={[plan, { ...plan, template_uuid: 't2', name: 'Safety', owned: false, owner: { name: 'OES', slug: 'oes' } }]} picked="" onPick={noop} onCancel={noop} />)
    expect(html).toContain('Launch Ready')
    expect(html).toContain('your plan')
    expect(html).toContain('OES’s plan you’re approved to run')
    expect(renderToStaticMarkup(<BadgeChooser plans={[]} picked="" onPick={noop} onCancel={noop} />)).toContain('No badges to award yet')
  })

  test('picks learners without invites or new groups, and marks who holds the badge', () => {
    const html = renderToStaticMarkup(<WhoStep award picks={[]} setPicks={noop} query="new@example.com" setQuery={noop} groups={[]} canGroups
      people={[{ user: { id: 9, name: 'Maya Rivera', username: 'maya' }, groups: [], role: 'learner' } as any]} taken={{ groups: new Set(), people: new Set([9]) }} />)
    expect(html).not.toContain('Invite new@example.com')
    expect(html).not.toContain('Create group')
  })

  test('signs off as the awarder for the learner picked', () => {
    const html = renderToStaticMarkup(<SignOff plan={plan} statement="" setStatement={noop} evidenceUrl="" setEvidenceUrl={noop} earnedOn="2026-10-24" setEarnedOn={noop}
      people={[maya]} notes={{}} setNotes={noop} confirmed={false} setConfirmed={noop} picks={[maya]} signer="Ana Ortiz" orgName="Riverside" />)
    expect(html).toContain('I confirm Maya Rivera completed work equal to <b>Launch Ready plan</b>: finishing all 6 steps of the plan. I’m signing off as Ana Ortiz for Riverside.')
    expect(html).toContain('Add a line for one learner')
  })

  test('reviews who gets it and who is skipped', () => {
    const html = renderToStaticMarkup(<Review plan={plan} statement="Built a portfolio" earnedOn="2026-10-24" evidenceUrl="" signer="Ana Ortiz" orgName="Riverside" goTo={noop}
      reach={{ learners: [{ user_id: 9, name: 'Maya Rivera', username: 'maya' }], skipped: [{ user_id: 3, name: 'Noah Kim', username: 'noah', reason: 'already_has_badge' }] }} />)
    expect(html).toContain('Maya Rivera')
    expect(html).toContain('1 learner skipped, they already have it: Noah Kim.')
    expect(html).toContain('Signed off by Ana Ortiz · Riverside')
  })
})
