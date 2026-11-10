'use client'

import { useState } from 'react'
import { ChevronDown, LibraryBig } from 'lucide-react'
import { Button } from '@components/ui/button'
import type { HubConversationSummary } from '@services/hub/advisor'
import { hubTimestampLabel } from '@services/hub/timestamp'

import { tr } from '@/lib/tr'

export const HUB_HOME_RECENT_LIMIT = 5

/** The rows Coach home shows: the latest few, or every conversation once expanded. */
export function visibleHubRecents(conversations: HubConversationSummary[], expanded: boolean) {
  return expanded ? conversations : conversations.slice(0, HUB_HOME_RECENT_LIMIT)
}

export default function HubHomeRecents({
  conversations,
  loading,
  disabled,
  onHistoryOpen,
  onSelect,
  onOpenResources,
}: {
  conversations: HubConversationSummary[]
  loading: boolean
  disabled: boolean
  onHistoryOpen: () => void
  // ESLint's base rule treats TypeScript callback parameter names as runtime bindings.
  // eslint-disable-next-line no-unused-vars
  onSelect: (_conversationUuid: string) => void
  // eslint-disable-next-line no-unused-vars
  onOpenResources: (_conversationUuid: string) => void
}) {
  const [open, setOpen] = useState(false)
  const recent = visibleHubRecents(conversations, open)
  const hasMore = conversations.length > HUB_HOME_RECENT_LIMIT

  if (!loading && recent.length === 0) return null

  const toggleHistory = () => {
    if (!open) onHistoryOpen()
    setOpen((current) => !current)
  }

  return (
    <section className="border-t border-border pt-5 pb-2" aria-label={tr('coach.hub_home_recents.recent_coach_conversations', 'Recent Coach conversations')}>
      <p className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">{tr('coach.hub_home_recents.recent_conversations', 'Recent conversations')}</p>
      <div aria-busy={loading}>
        {loading && recent.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground" role="status">{tr('coach.hub_home_recents.loading_conversations', 'Loading conversations…')}</p>
        ) : recent.map((conversation) => (
          <div
            key={conversation.conversation_uuid}
            className="flex w-full items-center gap-2 rounded-lg pr-1 hover:bg-muted/60"
          >
            <button
              type="button"
              disabled={disabled}
              className="flex min-w-0 flex-1 items-center gap-4 px-2 py-2 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              onClick={() => onSelect(conversation.conversation_uuid)}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{conversation.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{hubTimestampLabel(conversation.updated_at)}</span>
            </button>
            {conversation.resource_count > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5 px-2 text-muted-foreground"
                disabled={disabled}
                onClick={() => onOpenResources(conversation.conversation_uuid)}
                aria-label={tr('coach.hub_home_recents.open_title_resources_resource_count', 'Open {{title}} resources ({{resource_count}})', { title: conversation.title, resource_count: conversation.resource_count })}
              >
                <LibraryBig className="h-3.5 w-3.5" />
                <span className="text-xs tabular-nums">{conversation.resource_count}</span>
              </Button>
            )}
          </div>
        ))}
      </div>
      {(hasMore || open) && <button
        type="button"
        className="mt-0.5 flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        onClick={toggleHistory}
        aria-expanded={open}
      >
        {open ? tr('coach.hub_home_recents.show_less', 'Show less') : tr('coach.hub_home_recents.all_conversations', 'All conversations')}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>}
    </section>
  )
}
