'use client'

import type { Dispatch, FormEventHandler, RefObject } from 'react'
import { Plus, Send, Square } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import type { HubTurnIntent } from '@services/hub/advisor'

const INTENTS: Array<{ value: HubTurnIntent; label: string }> = [
  { value: 'chat', label: 'Chat' },
  { value: 'search', label: 'Search' },
  { value: 'work', label: 'Work' },
]

const PLACEHOLDERS: Record<HubTurnIntent, string> = {
  chat: 'Ask Hub for guidance…',
  search: 'What resources do you want to find?',
  work: 'What would you like to work on?',
}

export function HubIntentReceipt({ intent }: { intent: HubTurnIntent }) {
  const label = INTENTS.find((item) => item.value === intent)?.label || 'Chat'
  return <div className="flex justify-end"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground" data-testid="hub-message-intent">{label}</span></div>
}

export default function HubComposer({
  onSubmit, composerRef, draft, onDraftChange, onComposerScroll, composerFades,
  conversationLoading, libraryOpen, onLibraryToggle, canAttach, sending, canSend,
  onStop, intent, onIntentChange,
}: {
  onSubmit: FormEventHandler<HTMLFormElement>
  composerRef: RefObject<HTMLTextAreaElement | null>
  draft: string
  onDraftChange: Dispatch<string>
  onComposerScroll: Dispatch<HTMLTextAreaElement>
  composerFades: { top: boolean; bottom: boolean }
  conversationLoading: boolean
  libraryOpen: boolean
  onLibraryToggle: () => void
  canAttach: boolean
  sending: boolean
  canSend: boolean
  onStop: () => void
  intent: HubTurnIntent
  onIntentChange: Dispatch<HubTurnIntent>
}) {
  return <form onSubmit={onSubmit} className="flex flex-col justify-end">
    <div className="hub-composer-shell rounded-[1.6rem] p-2 backdrop-blur-md">
      <label htmlFor="hub-composer" className="sr-only">Ask a question or search Launch LMS</label>
      <div className="relative overflow-hidden rounded-xl">
        <Textarea
          ref={composerRef}
          id="hub-composer"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onScroll={(event) => onComposerScroll(event.currentTarget)}
          maxLength={2000}
          rows={1}
          placeholder={PLACEHOLDERS[intent]}
          disabled={conversationLoading}
          className="min-h-11 resize-none border-0 bg-transparent px-3 py-2.5 text-base leading-6 shadow-none focus-visible:ring-0"
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }}
        />
        <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-7 bg-gradient-to-b from-background via-background/80 to-transparent transition-opacity ${composerFades.top ? 'opacity-100' : 'opacity-0'}`} />
        <div aria-hidden="true" className={`hub-composer-fade pointer-events-none absolute inset-x-0 bottom-0 h-7 transition-opacity ${composerFades.bottom ? 'opacity-100' : 'opacity-0'}`} />
      </div>
      <div className="flex h-9 items-center justify-between gap-2">
        <Button type="button" size="icon" variant={libraryOpen ? 'secondary' : 'ghost'} className="h-8 w-8 shrink-0 text-muted-foreground" onClick={onLibraryToggle} disabled={!canAttach} title="Add resources from your Library" aria-label="Add resource context" aria-expanded={libraryOpen}>
          <Plus className="h-4 w-4" />
        </Button>
        <fieldset className="flex min-w-0 items-center rounded-lg bg-muted/70 p-0.5" disabled={conversationLoading || sending}>
          <legend className="sr-only">Response mode for next message</legend>
          {INTENTS.map((item) => <label key={item.value} className="cursor-pointer">
            <input className="peer sr-only" type="radio" name="hub-turn-intent" value={item.value} checked={intent === item.value} onChange={() => onIntentChange(item.value)} />
            <span className="flex h-7 items-center rounded-md px-2 text-[11px] font-medium text-muted-foreground transition peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-xs peer-focus-visible:outline-hidden peer-focus-visible:ring-2 peer-focus-visible:ring-ring sm:px-3 sm:text-xs">{item.label}</span>
          </label>)}
        </fieldset>
        <Button type={sending ? 'button' : 'submit'} size="icon" className="h-8 w-8 shrink-0" disabled={sending ? false : !canSend} aria-label={sending ? 'Stop response' : 'Send message'} onClick={sending ? onStop : undefined}>
          {sending ? <Square className="h-3.5 w-3.5 fill-current" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  </form>
}
