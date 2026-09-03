'use client'

import { FormEvent, useState } from 'react'
import { RotateCcw, Search, Send, Sparkles } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import { askHubAdvisor, HubAdvisorMessage } from '@services/hub/advisor'
import ResourcesClient from '../resources/resources'

type HubFilters = {
  channel?: string
  user_channel?: string
  query?: string
  q?: string
  resource_types?: string
  tags?: string
  access?: string
  provider?: string
}

export default function HubExperience({ orgslug, filters }: { orgslug: string; filters: HubFilters }) {
  const [mode, setMode] = useState<'search' | 'ask'>('search')
  const [messages, setMessages] = useState<HubAdvisorMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token

  const reset = () => {
    setMessages([])
    setDraft('')
    setError('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || !accessToken || !org?.id || sending) return
    let history = messages.slice(-10)
    while (history.length >= 2 && history.reduce((sum, item) => sum + item.content.length, 0) + content.length > 7_500) {
      history = history.slice(2)
    }
    const requestMessages: HubAdvisorMessage[] = [...history, { role: 'user', content }]
    setMessages(requestMessages)
    setDraft('')
    setError('')
    setSending(true)
    try {
      const response = await askHubAdvisor(org.id, requestMessages, accessToken)
      setMessages((current) => [...current, { role: 'assistant', content: response.answer }])
    } catch (requestError: any) {
      setError(requestError?.message || 'The advisor is temporarily unavailable. Search is still available.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <GeneralWrapperStyled>
        <div className="my-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-1.5" role="tablist" aria-label="Hub mode">
          <div className="flex min-w-0 flex-1 gap-1">
            <Button type="button" role="tab" aria-selected={mode === 'search'} variant={mode === 'search' ? 'default' : 'ghost'} className="flex-1 gap-2" onClick={() => setMode('search')}>
              <Search className="h-4 w-4" /> Search
            </Button>
            <Button type="button" role="tab" aria-selected={mode === 'ask'} variant={mode === 'ask' ? 'default' : 'ghost'} className="flex-1 gap-2" onClick={() => setMode('ask')}>
              <Sparkles className="h-4 w-4" /> Ask
            </Button>
          </div>
          {mode === 'ask' && messages.length > 0 && <Button type="button" variant="ghost" size="icon" aria-label="Start a new chat" title="Start a new chat" onClick={reset}><RotateCcw className="h-4 w-4" /></Button>}
        </div>
      </GeneralWrapperStyled>

      {mode === 'search' ? (
        <ResourcesClient
          orgslug={orgslug}
          initialChannelUuid={filters.channel}
          initialUserChannelUuid={filters.user_channel}
          initialQuery={filters.query || filters.q}
          initialResourceTypes={filters.resource_types}
          initialTags={filters.tags}
          initialAccess={filters.access}
          initialProvider={filters.provider}
          heading="Hub"
          basePath="/hub"
        />
      ) : (
        <GeneralWrapperStyled>
          <main className="mx-auto flex min-h-[calc(100dvh-13rem)] max-w-3xl flex-col pb-5" aria-labelledby="hub-ask-heading">
            <div className="py-4 text-center">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">Ephemeral advisor</p>
              <h1 id="hub-ask-heading" className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">What are you working toward?</h1>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Ask for perspective or help finding a next step. This chat disappears when you reload and cannot change anything in Launch LMS.</p>
            </div>

            <div className="flex-1 space-y-3 py-4" aria-live="polite" aria-busy={sending}>
              {messages.length === 0 && (
                <div className="rounded-3xl border-2 border-dashed border-border bg-muted p-8 text-center text-sm text-muted-foreground">
                  Try “I’m not sure what to do after graduation” or “Help me break a goal into a first step.”
                </div>
              )}
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[78%] ${message.role === 'user' ? 'bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)]' : 'border border-border bg-card text-foreground'}`}>
                    {message.content}
                  </div>
                </div>
              ))}
              {sending && <div className="w-fit rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground" role="status">Thinking…</div>}
              {error && <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}
            </div>

            <form onSubmit={submit} className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] rounded-3xl border border-border bg-card p-3 shadow-lg md:bottom-4">
              <label htmlFor="hub-advisor-message" className="sr-only">Message the Hub advisor</label>
              <Textarea id="hub-advisor-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={3} placeholder="Ask about a goal, decision, or next step…" disabled={sending} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{draft.length}/2000 · Enter to send, Shift+Enter for a new line</span>
                <Button type="submit" disabled={!draft.trim() || sending || !accessToken} className="gap-2">Send <Send className="h-4 w-4" /></Button>
              </div>
            </form>
          </main>
        </GeneralWrapperStyled>
      )}
    </>
  )
}
