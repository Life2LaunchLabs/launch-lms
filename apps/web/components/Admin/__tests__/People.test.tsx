import { afterAll, beforeAll, describe, expect, setSystemTime, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { feedEntries, withTimeline } from '@components/Connect/workspace/feed'
import { ReviewCard, turnInHref } from '@components/Threads/ThreadCards'
import { rowHref } from '@components/Admin/People/PeopleList'
import type { ChatMessage } from '@services/connect/connect'
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
})
