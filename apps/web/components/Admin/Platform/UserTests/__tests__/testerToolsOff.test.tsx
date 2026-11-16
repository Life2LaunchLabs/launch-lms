import { afterEach, describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TestPersonaBar from '@components/Admin/Platform/UserTests/TestPersonaBar'
import TestEntryPage from '@/app/auth/test-entry/page'

// DEV-27: with production settings (no switch set) the tester tools render nothing.
const saved = process.env.NEXT_PUBLIC_USER_TESTS_ENABLED
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_USER_TESTS_ENABLED
  else process.env.NEXT_PUBLIC_USER_TESTS_ENABLED = saved
})

describe('tester tools stay out of production (DEV-27)', () => {
  test('the test-persona bar renders nothing when user tests are off', () => {
    delete process.env.NEXT_PUBLIC_USER_TESTS_ENABLED
    expect(renderToStaticMarkup(<TestPersonaBar />)).toBe('')
    process.env.NEXT_PUBLIC_USER_TESTS_ENABLED = 'false'
    expect(renderToStaticMarkup(<TestPersonaBar />)).toBe('')
  })

  test('a test login link opens nothing when user tests are off', () => {
    delete process.env.NEXT_PUBLIC_USER_TESTS_ENABLED
    const html = renderToStaticMarkup(<TestEntryPage />)
    expect(html).toContain('Page not found')
    expect(html).not.toContain('test persona')
  })
})
