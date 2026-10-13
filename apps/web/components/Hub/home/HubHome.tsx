'use client'

import type { HubConversationSummary } from '@services/hub/advisor'
import HubHomeStack from './HubHomeStack'
import HubHomeRecents from './HubHomeRecents'

/** What the coach shows before a conversation: what to do next, ways to start, and recent chats. */
export default function HubHome({ orgslug, token, disabled, conversations, historyLoading, onHistoryOpen, onSelect, onOpenResources, onPick }: {
  orgslug: string
  token?: string
  disabled: boolean
  conversations: HubConversationSummary[]
  historyLoading: boolean
  onHistoryOpen: () => void
  /* eslint-disable no-unused-vars */
  onSelect: (uuid: string) => void
  onOpenResources: (uuid: string) => void
  onPick: (message: string) => void
  /* eslint-enable no-unused-vars */
}) {
  return <>
    <HubHomeStack orgslug={orgslug} token={token} disabled={disabled} onPick={onPick} />
    <HubHomeRecents conversations={conversations} loading={historyLoading} disabled={disabled} onHistoryOpen={onHistoryOpen} onSelect={onSelect} onOpenResources={onOpenResources} />
  </>
}
