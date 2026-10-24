import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageStep, ReviewStep, StaffStep, WhoStep } from '@components/Assignments/assign/FlowSteps'
import { ListPreview, StaffPreview } from '@components/Assignments/assign/FlowPreviews'
import DonePanel from '@components/Assignments/assign/DonePanel'
import { addDays, alreadyOn, baseRequest, defaultSchedule, moveStart, requestFor, scheduleProblem, staffProblem, type Recipient, type StaffPick } from '@services/assignments/assignFlow'

const document = { stages: [
  { key: 'explore', title: 'Explore', duration_weeks: 2, steps: [{ key: 'survey', title: 'Interest survey', type: 'activity' }, { key: 'visit', title: 'Campus visit', type: 'event' }] },
  { key: 'apply', title: 'Apply', duration_weeks: null, steps: [{ key: 'essay', title: 'Essay', type: 'write' }] },
] } as any
const me: StaffPick = { id: 1, name: 'Henry Ker', username: 'henry', role: 'lead', you: true }
const plan = { template_uuid: 't1', title: 'College & Career Launch', version: 3 }

describe('the schedule', () => {
  test('starts stages back to back by their weeks and ends the day before the next would start', () => {
    const schedule = defaultSchedule(document, '2026-10-26')
    expect(schedule.starts).toEqual(['2026-10-26', '2026-11-09'])
    expect(schedule.end).toBe('2026-11-15')
    expect(schedule.mode).toBe('pace')
  })

  test('moving the start keeps the stages’ spacing', () => {
    expect(moveStart(defaultSchedule(document, '2026-10-26'), '2026-11-02').starts).toEqual(['2026-11-02', '2026-11-16'])
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  test('a schedule needs an end, stages in order and steps due after they start', () => {
    const scheduled = { ...defaultSchedule(document, '2026-10-26'), mode: 'sched' as const }
    expect(scheduleProblem(scheduled)).toBe(null)
    expect(scheduleProblem({ ...scheduled, end: '' })).toBe('A schedule needs an end date.')
    expect(scheduleProblem({ ...scheduled, starts: ['2026-10-26', '2026-10-20'] })).toBe('Stages have to start in order.')
    expect(scheduleProblem({ ...scheduled, steps: { essay: { start_date: '2026-11-10', due_date: '2026-11-09' } } })).toBe('A step is due before it starts.')
    expect(scheduleProblem({ ...scheduled, mode: 'pace', end: '' })).toBe(null)
  })
})

describe('the requests', () => {
  test('self-paced sends no schedule, and an end only when there is one', () => {
    const base = baseRequest(document, { ...defaultSchedule(document, '2026-10-26') }, [me], 'Welcome!')
    expect([base.start_date, base.due_date, base.schedule, base.welcome_message]).toEqual(['2026-10-26', null, null, 'Welcome!'])
    expect(base.collaborators).toEqual([{ user_id: 1, role_key: 'lead' }])
    expect(baseRequest(document, { ...defaultSchedule(document, '2026-10-26'), hasEnd: true }, [me], '').due_date).toBe('2026-11-15')
  })

  test('on a schedule it sends stage starts and only the steps staff changed', () => {
    const schedule = { ...defaultSchedule(document, '2026-10-26'), mode: 'sched' as const, steps: { essay: { due_date: '2026-11-14', allow_late: false }, visit: {} } }
    const base = baseRequest(document, schedule, [me], '')
    expect(base.schedule).toEqual({
      stages: [{ stage_key: 'explore', start_date: '2026-10-26' }, { stage_key: 'apply', start_date: '2026-11-09' }],
      steps: [{ step_key: 'essay', start_date: null, due_date: '2026-11-14', open_early: true, allow_late: false }],
    })
    expect(base.due_date).toBe('2026-11-15')
  })

  test('each pick becomes its own assignment', () => {
    const base = baseRequest(document, defaultSchedule(document, '2026-10-26'), [me], '')
    expect(requestFor({ kind: 'group', id: 4, name: 'Seniors', count: 20 }, base).usergroup_id).toBe(4)
    expect(requestFor({ kind: 'member', id: 9, name: 'Maya', username: 'maya' }, base).user_id).toBe(9)
    expect(requestFor({ kind: 'email', email: 'New@Example.com ' }, base).subject_email).toBe('new@example.com')
    expect(requestFor({ kind: 'newgroup', name: 'Spring' }, base, { 'newgroup:spring': 12 }).usergroup_id).toBe(12)
  })

  test('staff need a Lead', () => {
    expect(staffProblem([me])).toBe(null)
    expect(staffProblem([{ ...me, role: 'review' }])).toContain('at least one person Lead')
  })

  test('groups and people already running the plan are known', () => {
    const rows = [
      { plan: { template_uuid: 't1' }, status: 'active', target: { type: 'group', id: 4 } },
      { plan: { template_uuid: 't1' }, status: 'ended', target: { type: 'group', id: 5 } },
      { plan: { template_uuid: 't2' }, status: 'active', target: { type: 'group', id: 6 } },
      { plan: { template_uuid: 't1' }, status: 'active', target: { type: 'person', person: { id: 9 } } },
    ] as any
    const taken = alreadyOn(rows, 't1')
    expect([...taken.groups]).toEqual([4])
    expect([...taken.people]).toEqual([9])
  })
})

describe('the steps', () => {
  const people = [{ user: { id: 9, name: 'Maya Rivera', username: 'maya' }, role: 'learner', role_name: 'Learner', groups: [{ id: 4, name: 'Seniors' }] }] as any
  const groups = [{ id: 4, name: 'Seniors', member_count: 20 }, { id: 5, name: 'Juniors', member_count: 18 }]

  test('Who offers groups and people, hides who already has the plan, and offers an invite for an email', () => {
    const none = { groups: new Set([5]), people: new Set<number>() }
    const html = renderToStaticMarkup(<WhoStep picks={[]} setPicks={() => undefined} query="" setQuery={() => undefined} groups={groups} people={people} canGroups taken={none} />)
    expect(html).toContain('Seniors')
    expect(html).not.toContain('Juniors')
    expect(html).toContain('Maya Rivera')
    const invite = renderToStaticMarkup(<WhoStep picks={[]} setPicks={() => undefined} query="sam@example.com" setQuery={() => undefined} groups={groups} people={[]} canGroups taken={none} />)
    expect(invite).toContain('Invite sam@example.com')
    const create = renderToStaticMarkup(<WhoStep picks={[]} setPicks={() => undefined} query="Spring" setQuery={() => undefined} groups={groups} people={[]} canGroups taken={none} />)
    expect(create).toContain('Create group “Spring”')
    expect(renderToStaticMarkup(<WhoStep picks={[]} setPicks={() => undefined} query="Spring" setQuery={() => undefined} groups={groups} people={[]} canGroups={false} taken={none} />)).not.toContain('Create group')
  })

  test('two picks say they make two assignments', () => {
    const picks: Recipient[] = [{ kind: 'group', id: 4, name: 'Seniors', count: 20 }, { kind: 'email', email: 'a@b.co' }]
    expect(renderToStaticMarkup(<WhoStep picks={picks} setPicks={() => undefined} query="" setQuery={() => undefined} groups={groups} people={[]} canGroups taken={{ groups: new Set(), people: new Set() }} />))
      .toContain('2 assignments, one for each')
  })

  test('Staff warns without a Lead and lists what each role does', () => {
    const html = renderToStaticMarkup(<StaffStep staff={[{ ...me, role: 'comment' }]} setStaff={() => undefined} query="" setQuery={() => undefined} options={[]} />)
    expect(html).toContain('Make at least one person Lead')
    expect(html).toContain('Changes dates, learners and settings')
    expect(html).toContain('aria-label="Role for Henry Ker"')
  })

  test('Message says how each kind of person gets it', () => {
    const html = renderToStaticMarkup(<MessageStep welcome="Hi" setWelcome={() => undefined} picks={[{ kind: 'email', email: 'a@b.co' }]} orgName="Riverside" />)
    expect(html).toContain('New people')
    expect(html).not.toContain('People in Riverside')
  })

  test('Review lists the dates, staff and message', () => {
    const schedule = { ...defaultSchedule(document, '2026-10-26'), mode: 'sched' as const }
    const html = renderToStaticMarkup(<ReviewStep template={{ template_uuid: 't1', title: 'College & Career Launch', published_version: 3 } as any} document={document}
      picks={[{ kind: 'group', id: 4, name: 'Seniors', count: 20 }]} schedule={schedule} staff={[me]} welcome="See you Monday" goTo={() => undefined} />)
    expect(html).toContain('Monday, Oct 26')
    expect(html).toContain('Apply')
    expect(html).toContain('Henry Ker')
    expect(html).toContain('See you Monday')
    expect(html).toContain('2 stages · 3 steps')
  })
})

describe('the previews and the end', () => {
  test('the list shows new rows above the ones running', () => {
    const html = renderToStaticMarkup(<ListPreview plan={plan} slug="riverside" picks={[{ kind: 'group', id: 4, name: 'Seniors', count: 20 }]}
      running={[{ assignment_uuid: 'a1', target: { type: 'group', id: 5, uuid: 'g5', name: 'Juniors' }, learner_count: 18, scheduled: true, counts: { done: 3, review: 0, behind: 0, open: 2, locked: 1 } } as any]} />)
    expect(html.indexOf('Seniors')).toBeLessThan(html.indexOf('Juniors'))
    expect(html).toContain('>New<')
  })

  test('the People tab preview shows the staff and their roles', () => {
    expect(renderToStaticMarkup(<StaffPreview plan={plan} slug="riverside" picks={[]} staff={[me]} />)).toContain('Changes dates, learners and settings')
  })

  test('done offers the group’s messages only for a group, and the schedule only when scheduled', () => {
    const group = renderToStaticMarkup(<DonePanel made={[{ assignment_uuid: 'a1', name: 'Seniors', group: true }]} scheduled onOpen={() => undefined} onClose={() => undefined} />)
    expect(group).toContain('Open Seniors')
    expect(group).toContain('Message the group')
    expect(group).toContain('Fine-tune the schedule')
    const person = renderToStaticMarkup(<DonePanel made={[{ assignment_uuid: 'a1', name: 'Maya', group: false }, { assignment_uuid: 'a2', name: 'Sam', group: false }]} scheduled={false} onOpen={() => undefined} onClose={() => undefined} />)
    expect(person).toContain('2 assignments created')
    expect(person).not.toContain('Message the group')
    expect(person).not.toContain('Fine-tune')
  })
})
