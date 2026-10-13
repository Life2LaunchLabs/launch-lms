'use client'

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Bookmark, Compass, Paperclip, Send, Square } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import type { HubAdvisorResource } from '@services/hub/advisor'
import type { Resource } from '@services/resources/resources'
import type { HubEditReviewItem } from '../HubContext'
import { HubResourceTrayHandle } from '../resources/HubResourceContext'
import HubResourceLibrary from '../resources/HubResourceLibrary'
import HubMemoryNotice from './HubMemoryNotice'

const LINE_HEIGHT = 24
const VERTICAL_PADDING = 20
const MAX_LINES = 8
export const COMPOSER_MIN_HEIGHT = LINE_HEIGHT + VERTICAL_PADDING
const COMPOSER_MAX_HEIGHT = LINE_HEIGHT * MAX_LINES + VERTICAL_PADDING

export type HubComposerHandle = { focus: () => void; submit: () => void }

type HubComposerProps = {
  orgslug: string
  orgId?: number
  accessToken?: string
  draft: string
  // eslint-disable-next-line no-unused-vars
  setDraft: (value: string) => void
  // eslint-disable-next-line no-unused-vars
  onSubmit: (event: FormEvent) => void
  onStop: () => void
  sending: boolean
  loading: boolean
  // eslint-disable-next-line no-unused-vars
  onHeightChange: (height: number) => void
  // eslint-disable-next-line no-unused-vars
  memory: { visible: boolean; enabled: boolean; saving: boolean; onSave: (enabled: boolean) => Promise<boolean>; onDismiss: () => Promise<void> }
  reviewItems: HubEditReviewItem[]
  // eslint-disable-next-line no-unused-vars
  onReview: (targetId: string) => void
  conversationStarted: boolean
  contextResources: HubAdvisorResource[]
  onOpenTray: () => void
  libraryOpen: boolean
  // eslint-disable-next-line no-unused-vars
  setLibraryOpen: (open: boolean) => void
  // eslint-disable-next-line no-unused-vars
  onAddResource: (resource: Resource) => void
  /** Leaves the chat to browse resources in Discover. */
  onBrowse?: () => void
}

/** The composer and everything docked above it: memory choice, review prompt, resources in this chat. */
const HubComposer = forwardRef<HubComposerHandle, HubComposerProps>(function HubComposer({ orgslug, orgId, accessToken, draft, setDraft, onSubmit, onStop, sending, loading, onHeightChange, memory, reviewItems, onReview, conversationStarted, contextResources, onOpenTray, libraryOpen, setLibraryOpen, onAddResource, onBrowse }, ref) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [fades, setFades] = useState({ top: false, bottom: false })
  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    submit: () => textareaRef.current?.form?.requestSubmit(),
  }), [])

  const updateFades = (textarea: HTMLTextAreaElement) => {
    const overflow = textarea.scrollHeight > textarea.clientHeight + 1
    setFades({ top: overflow && textarea.scrollTop > 1, bottom: overflow && textarea.scrollTop + textarea.clientHeight < textarea.scrollHeight - 1 })
  }

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const next = Math.min(Math.max(textarea.scrollHeight, COMPOSER_MIN_HEIGHT), COMPOSER_MAX_HEIGHT)
    textarea.style.height = `${next}px`
    textarea.style.overflowY = textarea.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
    onHeightChange(next)
    updateFades(textarea)
  }, [draft, onHeightChange])

  return <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[var(--z-sticky-header)]">
    <div aria-hidden="true" className="hub-composer-backdrop absolute bottom-0 left-0 right-2 -top-10" />
    <div className="pointer-events-auto relative mx-auto w-full max-w-[50rem] px-3 pb-3 sm:px-4 sm:pb-4">
      {memory.visible ? <HubMemoryNotice orgslug={orgslug} enabled={memory.enabled} saving={memory.saving} onSave={memory.onSave} onDismiss={() => void memory.onDismiss()} onLearnMore={(href) => { void memory.onDismiss().finally(() => window.location.assign(href)) }} /> : null}
      {reviewItems.length ? <div className="hub-edit-review-tray mb-2 flex items-center justify-between gap-3 rounded-2xl border-2 border-border bg-card px-3 py-2" role="status">
        <div className="min-w-0"><p className="truncate text-xs font-semibold">Ready to review</p><p className="truncate text-[11px] text-muted-foreground">{reviewItems.length === 1 ? reviewItems[0].label : `${reviewItems.length} objects changed`}</p></div>
        <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={() => onReview(reviewItems[0].targetId)}>Review <ArrowRight size={12} /></Button>
      </div> : null}
      {conversationStarted ? <HubResourceTrayHandle resources={contextResources} onOpen={onOpenTray} /> : null}
      <form onSubmit={onSubmit} className="flex flex-col justify-end">
        <div className="hub-composer-shell rounded-[1.4rem] p-2">
          <label htmlFor="hub-composer" className="sr-only">Ask a question or search Launch LMS</label>
          <div className="relative overflow-hidden rounded-xl">
            <Textarea
              ref={textareaRef}
              id="hub-composer"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onScroll={(event) => updateFades(event.currentTarget)}
              maxLength={2000}
              rows={1}
              placeholder="Message Hub"
              disabled={loading}
              className="min-h-11 resize-none border-0 bg-transparent px-3 py-2.5 text-base leading-6 shadow-none focus-visible:ring-0"
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }}
            />
            <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-7 bg-gradient-to-b from-background via-background/80 to-transparent transition-opacity ${fades.top ? 'opacity-100' : 'opacity-0'}`} />
            <div aria-hidden="true" className={`hub-composer-fade pointer-events-none absolute inset-x-0 bottom-0 h-7 transition-opacity ${fades.bottom ? 'opacity-100' : 'opacity-0'}`} />
          </div>
          <div className="flex h-9 items-center justify-between gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" disabled={!accessToken || !orgId} aria-label="Add a resource to this chat"><Paperclip className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-56">
                <DropdownMenuItem onSelect={() => setLibraryOpen(true)}><Bookmark /> Saved resource</DropdownMenuItem>
                {onBrowse ? <DropdownMenuItem onSelect={onBrowse}><Compass /> Find one in Discover</DropdownMenuItem> : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type={sending ? 'button' : 'submit'}
              size="icon"
              className="h-9 w-9 rounded-xl"
              disabled={sending ? false : !draft.trim() || loading || !accessToken}
              aria-label={sending ? 'Stop response' : 'Send message'}
              onClick={sending ? onStop : undefined}
            >
              {sending ? <Square className="h-3.5 w-3.5 fill-current" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </form>
      <HubResourceLibrary open={libraryOpen} onClose={() => setLibraryOpen(false)} orgslug={orgslug} orgId={orgId} accessToken={accessToken} onSelect={onAddResource} />
    </div>
  </div>
})

export default HubComposer
