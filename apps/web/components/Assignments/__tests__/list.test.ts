import { describe, expect, test } from 'bun:test'
import type { AssignmentListItem } from '@services/assignments/assignments'
import { byPlan, filterRows, rowDates, rowSubtitle } from '@services/assignments/list'

const plan = (uuid: string, title: string) => ({ template_uuid: uuid, title, version: 1 })
const item = (over: Partial<AssignmentListItem> = {}): AssignmentListItem => ({
  assignment_uuid: 'a1', target: { type: 'group', id: 1, uuid: 'g', name: 'Class of 2027' }, plan: plan('p1', 'Career Launch'),
  start_date: '2026-09-08', due_date: '2026-12-18', scheduled: true, stage: { position: 1, title: 'Explore careers', of: 3 },
  status: 'active', paused_at: null, ended_at: null, creation_date: '2026-09-01', learner_count: 18, step_count: 9,
  counts: { done: 1, review: 0, behind: 0, open: 1, locked: 0 }, needs: { questions: 0, review: 0, behind: 0 }, ...over,
})

describe('assignments list', () => {
  test('subtitles say how many and where', () => {
    expect(rowSubtitle(item(), '2026-10-24')).toBe('18 learners · Stage 2: Explore careers')
    expect(rowSubtitle(item({ start_date: '2026-11-01' }), '2026-10-24')).toBe('18 learners · Not started')
    expect(rowSubtitle(item({ status: 'paused' }))).toBe('18 learners · Paused')
    const person = item({ target: { type: 'person', person: null, name: 'Maya Rivera' }, learner_count: 1, scheduled: false, stage: null })
    expect(rowSubtitle(person)).toBe('Self-paced')
    expect(rowSubtitle(item({ learner_count: 0, target: { type: 'email', email: 'a@b.c', name: 'a@b.c' } }))).toBe('Invite sent · hasn’t joined yet')
    expect(rowSubtitle(item({ status: 'ended', learner_count: 1 }))).toBe('Ended · 1 learner')
  })

  test('dates are start and end, or when a self-paced one started', () => {
    expect(rowDates(item())).toEqual(['Sep 8', 'Dec 18'])
    expect(rowDates(item({ scheduled: false, due_date: null, start_date: '2026-10-12' }))).toEqual(['Started Oct 12', 'No end date'])
  })

  test('filters by running or ended, search and needs me, and groups by plan', () => {
    const rows = [item(), item({ assignment_uuid: 'a2', status: 'ended' }),
      item({ assignment_uuid: 'a3', plan: plan('p2', 'Money Basics'), needs: { questions: 2, review: 0, behind: 0 } })]
    expect(filterRows(rows, { query: '', ended: false, needsMe: false }).map((row) => row.assignment_uuid)).toEqual(['a1', 'a3'])
    expect(filterRows(rows, { query: 'money', ended: false, needsMe: false }).map((row) => row.assignment_uuid)).toEqual(['a3'])
    expect(filterRows(rows, { query: '', ended: false, needsMe: true }).map((row) => row.assignment_uuid)).toEqual(['a3'])
    expect(filterRows(rows, { query: '', ended: true, needsMe: false }).map((row) => row.assignment_uuid)).toEqual(['a2'])
    expect(byPlan(rows).map((group) => [group.plan.title, group.rows.length])).toEqual([['Career Launch', 2], ['Money Basics', 1]])
  })
})
