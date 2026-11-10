import { afterAll, beforeAll, describe, expect, setSystemTime, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { feedEntries, withTimeline } from '@components/Connect/workspace/feed'
import { ReviewCard, turnInHref } from '@components/Threads/ThreadCards'
import { rowHref } from '@components/Admin/People/PeopleList'
import { needsRowHref } from '@components/Admin/Home/Sections'
import { CardMessage, ReviewLinks } from '@components/Connect/workspace/ChatCards'
import type { NeedsRow } from '@services/goals/adminHome'
import type { ChatMessage, ChatTopic } from '@services/connect/connect'
import type { FeedRow } from '@services/school/people'

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }

beforeAll(() => setSystemTime(new Date('2026-10-19T15:00:00Z')))
afterAll(() => setSystemTime())

function render(node: React.ReactNode) {
  return renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)
}

describe('People', () => {
  test('a person’s cards sit between their messages by time', () => {
    const message = (uuid: string, at: string) => ({ message_uuid: uuid, creation_date: at }) as ChatMessage
    const entries = withTimeline(feedEntries([message('m1', '2026-10-18T09:00:00Z'), message('m2', '2026-10-18T11:00:00Z')]), [
      { key: 'turn-in', at: '2026-10-18T10:00:00', node: null },
      { key: 'approval', at: '2026-10-18T12:00:00Z', node: null },
    ])
    expect(entries.map((entry) => entry.kind === 'card' ? entry.item.key : entry.kind === 'message' ? entry.message.message_uuid : '')).toEqual(['m1', 'turn-in', 'm2', 'approval'])
  })

  test('people and groups in the list open their thread', () => {
    const person = { key: 'person:2', kind: 'person', person: { id: 2, username: 'lee', name: 'Lee Arner' }, role: 'learner', group: null } as FeedRow
    const group = { key: 'group:1', kind: 'group', person: null, role: null, group: { id: 1, name: 'Fall', member_count: 2 } } as FeedRow
    expect(rowHref('north', person).endsWith('/admin/threads/people/2')).toBe(true)
    expect(rowHref('north', group).endsWith('/admin/threads/groups/1')).toBe(true)
  })

  test('a turned-in step in a thread opens the review workspace at that step', () => {
    const item = { goal_uuid: 'goal_1', assignment_uuid: 'assignment_1', step_uuid: 'step_9', step_key: 'essay', title: 'Write an essay', submitted_at: '2026-10-19T14:00:00Z' }
    const html = render(<ReviewCard item={item} reviewHref={turnInHref(item)} />)
    expect(html).toContain('Write an essay')
    expect(html).toContain('/review?assignment=assignment_1&amp;step_key=essay&amp;focus=step_9')
    expect(turnInHref({ ...item, assignment_uuid: null })).toBe('/admin/plans/live/goal_1?chat=plan')
  })

  test('a hand-in under Home › Needs you opens its review, not the thread', () => {
    const review = { goal_uuid: 'goal_1', assignment_uuid: 'assignment_1', step_uuid: 'step_9', step_key: 'safety', title: 'Hand in your signed safety checklist', submitted_at: '2026-10-19T14:00:00Z' }
    const row = { key: 'person:2', kind: 'person', person: { id: 2, username: 'jordan', name: 'Jordan Diaz' }, role: 'learner', group: null,
      counts: { messages: 0, turn_ins: 1, approvals: 0 }, total: 1, review } as unknown as NeedsRow
    expect(needsRowHref('north', row)).toContain('/admin/plans/review?assignment=assignment_1&step_key=safety&focus=step_9')
    // With messages waiting too, the row still opens the thread, where those are.
    expect(needsRowHref('north', { ...row, counts: { messages: 2, turn_ins: 1, approvals: 0 } }).endsWith('/admin/threads/people/2')).toBe(true)
  })

  test('a turned-in card in a thread offers Review to whoever reviews it', () => {
    const message = { message_uuid: 'm1', kind: 'card', body: '', sender: { id: 2, username: 'jordan', name: 'Jordan Diaz' }, mine: false, creation_date: '2026-10-19T14:00:00Z', update_date: '2026-10-19T14:00:00Z',
      card: { type: 'plan_progress', goal_uuid: 'goal_1', goal_title: 'Safety', started: false, events: [{ step_uuid: 'step_9', title: 'Hand in your signed safety checklist', event: 'turned_in', at: '2026-10-19T14:00:00Z' }] } } as unknown as ChatMessage
    const topic = { goal_uuid: 'goal_1', title: 'Safety', status: 'active', source: 'org', count: 0, progress: { done: 0, total: 1, submitted: 1, behind: 0 },
      steps: [{ step_uuid: 'step_9', title: 'Hand in your signed safety checklist', status: 'submitted' }] } as unknown as ChatTopic
    const card = <CardMessage message={message} orgslug="north" topics={[topic]} time="7:00 AM" first onTag={() => {}} onAnswered={() => {}} />
    const reviewer = render(<ReviewLinks.Provider value={(goal, step) => goal === 'goal_1' && step === 'step_9' ? '/admin/plans/review?assignment=assignment_1' : undefined}>{card}</ReviewLinks.Provider>)
    expect(reviewer).toContain('href="/admin/plans/review?assignment=assignment_1"')
    expect(reviewer).toContain('Review')
    const other = render(card)
    expect(other).toContain('Awaiting review')
    expect(other).not.toContain('/admin/plans/review')
  })
})
