import { afterAll, beforeAll, describe, expect, setSystemTime, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SWRConfig } from 'swr'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import AssignmentPlan from '@components/Goals/admin/assignments/AssignmentPlan'
import AssignmentLearners from '@components/Goals/admin/assignments/AssignmentLearners'
import { needsOf } from '@components/Goals/admin/assignments/AssignmentsList'
import { feedEntries } from '@components/Connect/workspace/staffNotes'
import type { ChatMessage } from '@services/connect/connect'
import type { Inbox } from '@services/goals/admin'
import { matrix } from '@services/goals/__tests__/cohortFixture'

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }

beforeAll(() => setSystemTime(new Date('2026-10-19T15:00:00Z')))
afterAll(() => setSystemTime())

function render(node: React.ReactNode) {
  return renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>
    <SWRConfig value={{ provider: () => new Map() }}>{node}</SWRConfig>
  </AppRouterContext.Provider>)
}

const ctx = { orgslug: 'school', orgId: 1, token: 'token', assignmentUuid: 'a1', admin: true, refresh: () => undefined }

describe('an assignment’s plan', () => {
  test('counts each step across learners, with what’s left for staff under it', () => {
    const data = matrix()
    data.assignment.status = 'active'
    const html = render(<AssignmentPlan matrix={data} ctx={ctx} viewerUserId={9} />)
    // The template's stages and steps, counted.
    expect(html).toContain('aria-label="Explore"')
    expect(html).toContain('All 3 done')
    // Hand-ins go to the grading stack, back to this assignment.
    expect(html).toContain('ready to grade')
    expect(html).toContain('Start grading')
    expect(html).toContain('from=assignment')
    // Late hand-ins: reminded today already, so no second reminder.
    expect(html).toContain('Reminded today')
    // The fair is staff's to settle.
    expect(html).toContain('Staff confirm this')
  })
})

describe('an assignment’s learners', () => {
  test('rows by need, with dots, pace, attention and who else helps', () => {
    const html = render(<AssignmentLearners matrix={matrix()} orgslug="school" orgId={1} token="token" />)
    expect(html).toContain('aria-label="Search learners"')
    expect(html).toContain('Export evidence CSV for 3')
    expect(html).toContain('Plan</b> now')
    // Learner 3 is late on Values, so they come first.
    expect(html.indexOf('Open L3’s plan feed')).toBeLessThan(html.indexOf('Open L1’s plan feed'))
    expect(html).toContain('Behind · 1 step')
    expect(html).toContain('Handed in: resume')
    expect(html).toContain('Sent back: resume')
    // The assignment's own staff are left out of helpers.
    expect(html).toContain('Pat · Guardian')
    expect(html).not.toContain('Ms. Rivera · Staff')
  })
})

describe('what an assignment list says waits on staff', () => {
  test('grading and settling counted per assignment, nudges left out', () => {
    const inbox = { groups: [
      { assignment_uuid: 'a1', kind: 'review', count: 2 }, { assignment_uuid: 'a1', kind: 'grade', count: 1 },
      { assignment_uuid: 'a1', kind: 'confirm', count: 3 }, { assignment_uuid: 'a2', kind: 'nudge', count: 4 },
    ] } as unknown as Inbox
    expect(needsOf(inbox)).toEqual({ a1: { grade: 3, settle: 3 } })
  })
})

describe('a learner’s feed for staff', () => {
  test('staff notes sit between messages in the order they were written', () => {
    const message = (uuid: string, at: string) => ({ message_uuid: uuid, creation_date: at }) as ChatMessage
    const note = { note_uuid: 'n1', body: 'Talked with mom', author: null, creation_date: '2026-10-18T10:00:00', can_delete: true }
    const entries = feedEntries([message('m1', '2026-10-18T09:00:00Z'), message('m2', '2026-10-18T11:00:00Z')], [note])
    expect(entries.map((entry) => entry.kind === 'note' ? entry.note.note_uuid : entry.message.message_uuid)).toEqual(['m1', 'n1', 'm2'])
  })
})
