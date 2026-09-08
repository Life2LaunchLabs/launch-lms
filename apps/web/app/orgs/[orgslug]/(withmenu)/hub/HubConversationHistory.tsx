'use client'

import { useMemo, useState } from 'react'
import { LibraryBig, MessageSquare, Search } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import type { HubConversationSummary } from '@services/hub/advisor'

function dateLabel(value: string) {
  const date = new Date(value)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

export default function HubConversationHistory({
  conversations,
  activeConversationUuid,
  loading,
  disabled,
  attached = true,
  onSelect,
  onOpenResources,
}: {
  conversations: HubConversationSummary[]
  activeConversationUuid: string | null
  loading: boolean
  disabled: boolean
  attached?: boolean
  // ESLint's base rule treats TypeScript callback parameter names as runtime bindings.
  // eslint-disable-next-line no-unused-vars
  onSelect: (_conversationUuid: string) => void
  // eslint-disable-next-line no-unused-vars
  onOpenResources: (_conversationUuid: string) => void
}) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return normalized
      ? conversations.filter((conversation) => (
        conversation.title.toLocaleLowerCase().includes(normalized)
        || conversation.latest_user_message.toLocaleLowerCase().includes(normalized)
      ))
      : conversations
  }, [conversations, query])

  return (
    <div className={`max-h-[min(34rem,calc(100dvh-5rem))] overflow-hidden border border-border/70 bg-background shadow-xl shadow-black/10 ${attached ? 'rounded-b-xl border-t-0' : 'rounded-xl'}`}>
      <div className="relative p-2.5">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search conversations…"
          aria-label="Search conversations"
          className="h-9 border-0 bg-muted/70 pl-9 shadow-none focus-visible:ring-1"
          autoFocus
        />
      </div>
      <div className="max-h-[min(29rem,calc(100dvh-9rem))] overflow-y-auto px-1.5 pb-2" aria-busy={loading}>
        {loading ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground" role="status">Loading conversations…</p>
        ) : visible.length === 0 ? (
          <div className="px-5 py-9 text-center">
            <MessageSquare className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">{query ? 'No matching conversations' : 'No saved conversations yet'}</p>
            {!query && <p className="mt-1 text-xs text-muted-foreground">Your first message will start one.</p>}
          </div>
        ) : visible.map((conversation) => (
          <div
            key={conversation.conversation_uuid}
            className={`flex w-full items-center gap-2 rounded-lg pr-2 ${conversation.conversation_uuid === activeConversationUuid ? 'bg-muted' : 'hover:bg-muted/60'}`}
          >
            <button
              type="button"
              disabled={disabled}
              className="min-w-0 flex-1 px-3 py-2 text-left disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onSelect(conversation.conversation_uuid)}
            >
              <span className="flex items-center gap-4">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{conversation.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{dateLabel(conversation.updated_at)}</span>
              </span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                {conversation.latest_user_resource_count > 0 && (
                  <span className="shrink-0 rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    +{conversation.latest_user_resource_count} {conversation.latest_user_resource_count === 1 ? 'resource' : 'resources'}
                  </span>
                )}
                <span className="truncate text-xs text-muted-foreground">{conversation.latest_user_message}</span>
              </span>
            </button>
            {conversation.resource_count > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5 px-2 text-muted-foreground"
                disabled={disabled}
                onClick={() => onOpenResources(conversation.conversation_uuid)}
                aria-label={`Open ${conversation.title} resources (${conversation.resource_count})`}
              >
                <LibraryBig className="h-3.5 w-3.5" />
                <span className="text-xs tabular-nums">{conversation.resource_count}</span>
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
