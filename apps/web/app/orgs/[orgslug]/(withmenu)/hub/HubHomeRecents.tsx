'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LibraryBig } from 'lucide-react'
import { Button } from '@components/ui/button'
import type { HubConversationSummary } from '@services/hub/advisor'
import HubConversationHistory from './HubConversationHistory'

function dateLabel(value: string) {
  const date = new Date(value)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
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
  const rootRef = useRef<HTMLDivElement>(null)
  const recent = conversations.slice(0, 3)

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  if (!loading && recent.length === 0) return null

  const toggleHistory = () => {
    if (!open) onHistoryOpen()
    setOpen((current) => !current)
  }

  return (
    <section ref={rootRef} className="relative z-10 pb-2" aria-label="Recent Hub conversations">
      <p className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">Recent</p>
      <div aria-busy={loading}>
        {loading && recent.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground" role="status">Loading conversations…</p>
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
              <span className="shrink-0 text-xs text-muted-foreground">{dateLabel(conversation.updated_at)}</span>
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
      <button
        type="button"
        className="mt-0.5 flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        onClick={toggleHistory}
        aria-expanded={open}
      >
        See more
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full">
          <HubConversationHistory
            conversations={conversations}
            activeConversationUuid={null}
            loading={loading}
            disabled={disabled}
            attached={false}
            onSelect={(uuid) => { setOpen(false); onSelect(uuid) }}
            onOpenResources={(uuid) => { setOpen(false); onOpenResources(uuid) }}
          />
        </div>
      )}
    </section>
  )
}
