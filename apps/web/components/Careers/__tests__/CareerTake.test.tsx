import { expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import CareerTake from '@components/Careers/CareerTake'

// DEV-34 / FEED-155 / FEED-138: saving a career asks one thing at most. The note and the EPP switch wait,
// folded away and off, until the learner opens them.

const fresh = (state: any = null) => renderToStaticMarkup(<CareerTake resourceUuid="resource_1" state={state} token="token" fresh onSkip={() => {}} />)

test('right after saving, only "How into it are you?" is asked, nothing is picked, and it says it is already saved', () => {
  const html = fresh()
  expect(html).toContain('How into it are you?')
  expect(html).toContain('already saved')
  expect(html).not.toContain('aria-checked="true"')
  expect(html).not.toContain('What caught your eye?')
  expect(html).not.toContain('Add to my EPP')
  expect(html).toContain('Add a note, or put it on your EPP')
  expect(html).toContain('aria-expanded="false"')
  expect(html).toContain('Done')
})

test('a career with a note or on the EPP opens with those showing, and EPP is never switched on for them', () => {
  const html = fresh({ interest_level: 3, notes: 'Love animals', show_on_epp: false })
  expect(html).toContain('What caught your eye?')
  expect(html).toContain('Love animals')
  expect(html).toContain('aria-expanded="true"')
  expect(html).not.toContain('already saved')
  expect(/role="switch"[^>]*aria-checked="false"/.test(html)).toBe(true)
})
