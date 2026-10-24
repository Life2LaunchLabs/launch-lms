import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import StatusBar, { StatusLegend } from '@components/Assignments/StatusBar'
import { CountIcons, MessageButton, NeedChips, NeedsButton } from '@components/Assignments/Needs'
import PickerField, { pickable } from '@components/Assignments/PickerField'
import ScheduleLine from '@components/Assignments/ScheduleLine'
import { AssignmentStory } from '@components/Assignments/Pair'
import { needsText, nowAt, personLabel, scheduleFlags, scheduleSummary, segmentTip } from '@services/assignments/status'

const counts = (done: number, review: number, behind: number, open: number, locked: number) => ({ done, review, behind, open, locked })

describe('the status bar', () => {
  test('now sits after what is past, and only when something is on each side', () => {
    expect(nowAt(counts(2, 1, 1, 4, 0))).toBe(0.5)
    expect(nowAt(counts(4, 0, 0, 0, 0))).toBe(null)
    expect(nowAt(counts(0, 0, 0, 3, 2))).toBe(null)
    expect(nowAt(counts(0, 0, 0, 0, 0))).toBe(null)
  })

  test('segments come in time order, leave out empty categories, and say what they hold', () => {
    const html = renderToStaticMarkup(<StatusBar counts={counts(3, 0, 1, 2, 0)} label="Resume" />)
    expect(html).toContain('aria-label="Resume: Complete 3, Behind schedule 1, Open 2"')
    expect(html.indexOf('bg-good')).toBeLessThan(html.indexOf('bg-late'))
    expect(html.indexOf('bg-late')).toBeLessThan(html.indexOf('bg-open'))
    expect(html).not.toContain('bg-brand')
    expect(html).toContain('left:66.66666666666666%')
    expect(renderToStaticMarkup(<StatusBar counts={counts(0, 0, 0, 0, 0)} />)).toContain('Nothing yet')
  })

  test('tips name who is in a segment, or count them', () => {
    expect(segmentTip('Behind schedule', 2, ['Maya', 'Sam'])).toBe('Behind schedule: Maya, Sam')
    expect(segmentTip('Open', 4, undefined, 'steps')).toBe('Open: 4 steps')
  })

  test('the legend lists all five', () => {
    const html = renderToStaticMarkup(<StatusLegend />)
    for (const label of ['Complete', 'Awaiting review', 'Behind schedule', 'Open', 'Not open yet']) expect(html).toContain(label)
  })
})

describe('what needs staff', () => {
  test('the button counts them all, or says all clear', () => {
    expect(needsText({ questions: 2, review: 0, behind: 1 })).toBe('2 questions · 1 past due')
    expect(renderToStaticMarkup(<NeedsButton needs={{ questions: 2, review: 3, behind: 1 }} />)).toContain('6 need you: 2 questions · 3 to review · 1 past due')
    expect(renderToStaticMarkup(<NeedsButton needs={{ questions: 0, review: 0, behind: 0 }} />)).toContain('All clear')
  })

  test('icons and chips leave out what is zero', () => {
    const icons = renderToStaticMarkup(<CountIcons needs={{ questions: 1, review: 0, behind: 2 }} />)
    expect(icons).toContain('1 question')
    expect(icons).toContain('2 past due')
    expect(icons).not.toContain('to review')
    expect(renderToStaticMarkup(<NeedChips messages={3} review={0} behind={0} />)).toContain('3 messages')
  })

  test('a learner’s Message button shows their needs in place of its label', () => {
    expect(renderToStaticMarkup(<MessageButton onClick={() => undefined} />)).toContain('>Message<')
    expect(renderToStaticMarkup(<MessageButton needs={{ questions: 1, review: 1, behind: 0 }} onClick={() => undefined} />)).toContain('aria-label="Message · 1 question · 1 to review"')
  })
})

describe('the picker field', () => {
  test('Enter takes the first suggestion that can be picked', () => {
    const item = (key: string, disabled = false) => ({ key, tile: null, title: key, disabled, onPick: () => undefined })
    expect(pickable([{ heading: 'Groups', items: [item('g1', true)] }, { items: [item('p1'), item('p2')] }]).map((x) => x.key)).toEqual(['p1', 'p2'])
  })

  test('picks show as removable tokens and the top suggestion is marked', () => {
    const html = renderToStaticMarkup(<PickerField picks={['Maya Rivera']} tokenKey={(x) => x} tokenTile={() => null} tokenLabel={(x) => x} onRemove={() => undefined}
      query="sa" onQuery={() => undefined} placeholder="Add more" label="Add people"
      groups={[{ heading: 'People', items: [{ key: 'sam', tile: null, title: 'Sam Patel', sub: 'sam@riverside.org', onPick: () => undefined }] }]} />)
    expect(html).toContain('aria-label="Remove Maya Rivera"')
    expect(html).toContain('>People<')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('>Enter</kbd>')
  })
})

describe('a schedule line', () => {
  test('sums up its dates and what its switches change', () => {
    expect(scheduleSummary({})).toBe('Follows stage')
    expect(scheduleSummary({ due_date: '2026-10-09' })).toBe('Stage start → Oct 9')
    expect(scheduleSummary({ start_date: '2026-10-01', due_date: '2026-10-09' })).toBe('Oct 1 → Oct 9')
    expect(scheduleSummary({}, '2026-11-02')).toBe('Event Nov 2')
    expect(scheduleFlags({ start_date: '2026-10-01', open_early: false, allow_late: false })).toBe('Locked until start · No late work')
    expect(scheduleFlags({ open_early: false })).toBe('')
  })

  test('opened, it edits the dates and offers opening with the stage once there is a start', () => {
    const step = { key: 'essay', title: 'Essay', type: 'write' }
    const closed = renderToStaticMarkup(<ScheduleLine step={step} dates={{}} open={false} onToggle={() => undefined} onChange={() => undefined} />)
    expect(closed).not.toContain('Essay due')
    const open = renderToStaticMarkup(<ScheduleLine step={step} dates={{}} open onToggle={() => undefined} onChange={() => undefined} />)
    expect(open).toContain('aria-label="Essay due"')
    expect(open).toContain('Allow late')
    expect(open).not.toContain('Open from start of stage')
    expect(renderToStaticMarkup(<ScheduleLine step={step} dates={{ start_date: '2026-10-01' }} open onToggle={() => undefined} onChange={() => undefined} />)).toContain('Open from start of stage')
  })
})

test('the assignment’s title reads who, working on, the plan', () => {
  expect(personLabel({ username: 'lee', first_name: 'Lee', last_name: 'Arner' })).toBe('Lee Arner')
  expect(personLabel({ username: 'lee' })).toBe('lee')
  const html = renderToStaticMarkup(<AssignmentStory target={{ type: 'group', id: 1, uuid: 'g', name: 'Seniors' }}
    plan={{ template_uuid: 't1', title: 'College & Career Launch', version: 2 }} planHref="/plans/t1" />)
  expect(html.indexOf('Seniors')).toBeLessThan(html.indexOf('working on'))
  expect(html.indexOf('working on')).toBeLessThan(html.indexOf('College &amp; Career Launch'))
  expect(html).toContain('href="/plans/t1"')
})
