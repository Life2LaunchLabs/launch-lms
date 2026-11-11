import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import HubHeader from '@components/Hub/conversation/HubHeader'
import HubHomeRecents, { visibleHubRecents } from '@components/Hub/home/HubHomeRecents'
import type { HubConversationSummary } from '@services/hub/advisor'

const conversation = (n: number) => ({
  conversation_uuid: `conversation_${n}`,
  title: `Chat ${n}`,
  updated_at: '2026-11-01T12:00:00Z',
  resource_count: 0,
}) as HubConversationSummary

const many = Array.from({ length: 8 }, (_, i) => conversation(i + 1))
const noop = () => {}

const header = (props: Partial<React.ComponentProps<typeof HubHeader>>) => renderToStaticMarkup(
  <HubHeader conversationUuid={null} title="Coach" conversations={many} loading={false} disabled={false}
    onHistoryOpen={noop} onNew={noop} onSelect={noop} onOpenResources={noop}
    onRename={async () => {}} onArchive={async () => {}} onTuck={noop} onEnd={noop} {...props} />,
)

describe('Coach home history', () => {
  test('the header on Coach home has no conversation switcher', () => {
    const html = header({})
    expect(html).toContain('Coach')
    expect(html).not.toContain('lucide-chevron-down')
  })

  test('inside a chat the header title still opens the conversation switcher', () => {
    const html = header({ conversationUuid: 'conversation_1', title: 'Chat 1' })
    expect(html).toContain('Chat 1')
    expect(html).toContain('lucide-chevron-down')
  })

  test('All conversations adds more rows to the same list', () => {
    expect(visibleHubRecents(many, false).map((c) => c.title)).toEqual(['Chat 1', 'Chat 2', 'Chat 3', 'Chat 4', 'Chat 5'])
    expect(visibleHubRecents(many, true)).toHaveLength(8)
    const html = renderToStaticMarkup(<HubHomeRecents conversations={many} loading={false} disabled={false} onHistoryOpen={noop} onSelect={noop} onOpenResources={noop} />)
    expect(html).toContain('All conversations')
    expect(html).not.toContain('Chat 6')
  })

  test('a short history has nothing more to show', () => {
    const html = renderToStaticMarkup(<HubHomeRecents conversations={many.slice(0, 3)} loading={false} disabled={false} onHistoryOpen={noop} onSelect={noop} onOpenResources={noop} />)
    expect(html).toContain('Chat 3')
    expect(html).not.toContain('All conversations')
  })
})
