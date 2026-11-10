import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import HubHeader from '@components/Hub/conversation/HubHeader'

const noop = () => {}

// What Coach's panel passed while the page had shared no details. Kept as a loose prop so this
// test still catches the note coming back under the old flag.
const pageUnreadable = { contextUnavailable: true } as Record<string, unknown>

function header() {
  return renderToStaticMarkup(
    <HubHeader {...pageUnreadable} conversationUuid={null} title="Coach" conversations={[]} loading={false} disabled={false}
      onHistoryOpen={noop} onNew={noop} onSelect={noop} onOpenResources={noop} onRename={async () => {}} onArchive={async () => {}}
      onTuck={noop} onEnd={noop} />,
  )
}

describe('the Coach header', () => {
  // FEED-73: on Discover, a phase page or its budget, learners read "I can't read this page yet"
  // as Coach being unable to help with their plan. Coach answers on every page, so no such note shows.
  test('on a page that shares no page details, it does not say Coach cannot read the page', () => {
    const html = header()
    expect(html).toContain('Close Coach')
    expect(html).not.toContain('read this page')
    expect(html).not.toContain('About Coach page awareness')
  })
})
