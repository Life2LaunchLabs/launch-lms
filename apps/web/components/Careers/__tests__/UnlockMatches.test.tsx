import { expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import UnlockMatches, { MatchAccuracyButton } from '@components/Careers/UnlockMatches'
import type { MatchQuest } from '@services/life/careers'

// FEED-81: "Unlock your matches" took over the top of Discover. It now waits behind a small "Match accuracy"
// gauge on the Career swipe billboard, and its list is compact rows like the portfolio's quests.

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }
const quest: MatchQuest = {
  done: 2, total: 5, complete: false,
  items: [
    { key: 'interests', title: 'Take the interest quiz', unlocks: 'Ranks careers by fit', done: true },
    { key: 'skills', title: 'Pick your skills', unlocks: 'Nudges careers that use them', done: true },
    { key: 'styles', title: 'Pick work styles', unlocks: 'Shows how you like to work', done: false, have: 1, need: 3 },
    { key: 'home', title: 'Set your home base', unlocks: 'Pay near you', done: false },
    { key: 'school', title: 'Add your school', unlocks: 'Training time from where you are', done: false },
  ],
}
const render = (node: React.ReactNode) => renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>{node}</AppRouterContext.Provider>)

test('the billboard indicator is one small button that says how accurate matches are and opens the list', () => {
  const html = render(<MatchAccuracyButton quest={quest} open={false} onToggle={() => {}} controls="unlock-matches" />)
  expect(html).toContain('Match accuracy')
  expect(html).toContain('2/5')
  expect(html).toContain('aria-expanded="false"')
  expect(html).toContain('aria-controls="unlock-matches"')
})

test('the dropped list is compact: every item one row, no big Go buttons, locked home block or privacy paragraph', () => {
  const html = render(<UnlockMatches variant="drop" quest={quest} orgslug="school" token="t" onClose={() => {}} />)
  expect(html).toContain('Unlock your matches · 2 of 5')
  expect(html.match(/<li/g)?.length).toBe(5)
  expect(html).toContain('1 of 3')
  expect(html).toContain('/portfolio/timeline/new?type=education')
  expect(html).not.toContain('/portfolio/interests') // done rows aren't links
  expect(html).not.toContain('>Go<')
  expect(html).not.toContain('Your Explore home:')
  expect(html).not.toContain('only show on your portfolio')
  expect(html).toContain('Close')
})

test('on the Explore home it is a bar whose header opens and closes the same list', () => {
  const open = render(<UnlockMatches quest={quest} orgslug="school" token="t" />)
  expect(open).toContain('aria-expanded="true"')
  expect(open.match(/<li/g)?.length).toBe(5)
  const closed = render(<UnlockMatches quest={quest} orgslug="school" token="t" defaultOpen={false} />)
  expect(closed).toContain('aria-expanded="false"')
  expect(closed).not.toContain('<li')
})
