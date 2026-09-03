'use client'

import { FormEvent, useState } from 'react'
import { RotateCcw, Search, Send, Sparkles } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import { askHubAdvisor, HubAdvisorMessage } from '@services/hub/advisor'
import HubQuickSearch from './HubQuickSearch'

type HubFilters = {
  channel?: string
  user_channel?: string
  query?: string
  q?: string
  type?: string
  resource_types?: string
  tags?: string
  access?: string
  provider?: string
}

export default function HubExperience({ orgslug, filters }: { orgslug: string; filters: HubFilters }) {
  const [mode, setMode] = useState<'search' | 'ask'>('search')
  const [messages, setMessages] = useState<HubAdvisorMessage[]>([])
  const [draft, setDraft] = useState(filters.query || filters.q || '')
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
    if (mode !== 'ask') return
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

  const hasSearchContext = Boolean(
    draft.trim() || filters.channel || filters.user_channel || filters.resource_types || filters.tags || filters.access || filters.provider
  )

  return (
    <GeneralWrapperStyled>
      <main className={`mx-auto flex min-h-[calc(100dvh-9rem)] max-w-3xl flex-col pb-6 ${!hasSearchContext && messages.length === 0 ? 'justify-center' : ''}`} aria-labelledby="hub-heading">
        <div className="py-6 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">Hub</p>
          <h1 id="hub-heading" className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">What can we help you find or think through?</h1>
        </div>

        <form onSubmit={submit} className="rounded-3xl border border-border bg-card p-3 shadow-lg">
          <label htmlFor="hub-composer" className="sr-only">{mode === 'search' ? 'Search Launch LMS' : 'Message the Hub advisor'}</label>
          <Textarea
            id="hub-composer"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder={mode === 'search' ? 'Search resources, badges, communities, people, and more…' : 'Ask about a goal, decision, or next step…'}
            disabled={sending}
            className="resize-none border-0 px-2 text-base shadow-none focus-visible:ring-0"
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey) return
              event.preventDefault()
              if (mode === 'ask') event.currentTarget.form?.requestSubmit()
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2">
            <div className="flex gap-1" role="tablist" aria-label="Hub mode">
              <Button type="button" role="tab" size="sm" aria-selected={mode === 'search'} variant={mode === 'search' ? 'secondary' : 'ghost'} className="gap-2" onClick={() => setMode('search')}>
                <Search className="h-4 w-4" /> Search
              </Button>
              <Button type="button" role="tab" size="sm" aria-selected={mode === 'ask'} variant={mode === 'ask' ? 'secondary' : 'ghost'} className="gap-2" onClick={() => setMode('ask')}>
                <Sparkles className="h-4 w-4" /> Ask
              </Button>
            </div>
            {mode === 'ask' && (
              <Button type="submit" size="sm" disabled={!draft.trim() || sending || !accessToken} className="gap-2">
                Send <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>

        {mode === 'search' ? (
          <HubQuickSearch
            orgslug={orgslug}
            orgId={org?.id}
            query={draft}
            initialType={filters.type}
            resourceFilters={{
              channel: filters.channel,
              user_channel: filters.user_channel,
              resource_types: filters.resource_types,
              tags: filters.tags,
              access: filters.access,
              provider: filters.provider,
            }}
          />
        ) : (
          <div className="mt-5 flex-1 space-y-3" aria-live="polite" aria-busy={sending}>
            {messages.length > 0 && (
              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={reset}><RotateCcw className="h-4 w-4" /> New chat</Button>
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
        )}
      </main>
    </GeneralWrapperStyled>
  )
}
