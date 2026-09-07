'use client'

import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight, Plus, RotateCcw, Search, Send, Sparkles } from 'lucide-react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Card } from '@components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Textarea } from '@components/ui/textarea'
import ResourceTypeVisual from '@components/Resources/ResourceTypeVisual'
import { getResourceThumbnailMediaDirectory } from '@services/media/media'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { askHubAdvisor, HubAdvisorMessage, HubAdvisorResource } from '@services/hub/advisor'
import HubQuickSearch, { HubSearchType, HUB_SEARCH_TYPES } from './HubQuickSearch'
import {
  advisorFailureRecovery,
  autoViewAfterBehaviorChange,
  hubCanAsk,
  HubBehavior,
  showsHubDiscovery,
  AutoView,
} from './hubInteraction'

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

const COMPOSER_LINE_HEIGHT = 24
const COMPOSER_VERTICAL_PADDING = 20
const COMPOSER_MAX_LINES = 8
const COMPOSER_MIN_HEIGHT = COMPOSER_LINE_HEIGHT + COMPOSER_VERTICAL_PADDING
const COMPOSER_MAX_HEIGHT = COMPOSER_LINE_HEIGHT * COMPOSER_MAX_LINES + COMPOSER_VERTICAL_PADDING
function initialSearchTypes(filters: HubFilters, query: string): HubSearchType[] {
  if (HUB_SEARCH_TYPES.some((item) => item.value === filters.type)) return [filters.type as HubSearchType]
  if (filters.channel || filters.user_channel || filters.resource_types || filters.tags || filters.access || filters.provider) return ['resources']
  return query.trim() ? ['all'] : []
}

function GroundedResourceCard({ resource, orgslug }: { resource: HubAdvisorResource; orgslug: string }) {
  const imageSrc = resource.thumbnail_image && resource.owner_org_uuid
    ? getResourceThumbnailMediaDirectory(resource.owner_org_uuid, resource.resource_uuid, resource.thumbnail_image)
    : resource.cover_image_url
  const href = getUriWithOrg(
    orgslug,
    routePaths.org.resource(resource.resource_uuid.replace('resource_', ''))
  )

  return (
    <Card asChild variant="interactive" size="none" className="w-[15.5rem] shrink-0 snap-start overflow-hidden rounded-2xl border-border/70 bg-card shadow-sm">
      <Link href={href} target="_blank" rel="noreferrer" className="group block" aria-label={`Open ${resource.title} in a new tab`}>
        <ResourceTypeVisual
          type={resource.resource_type}
          title={resource.title}
          imageSrc={imageSrc}
          className="aspect-[16/9] w-full border-b border-border/50"
          iconClassName="h-8 w-8 opacity-80"
        />
        <div className="p-3.5">
          <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <span className="truncate">{resource.provider_name || resource.resource_type}</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </div>
          <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-foreground">{resource.title}</h3>
          {resource.description && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{resource.description}</p>
          )}
        </div>
      </Link>
    </Card>
  )
}

function AssistantResponse({ content, resources = [], orgslug }: { content: string; resources?: HubAdvisorResource[]; orgslug: string }) {
  return (
    <article className="max-w-none text-[15px] leading-7 text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          h1: ({ children }) => <h1 className="mb-3 mt-7 text-2xl font-semibold tracking-tight first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-6 text-xl font-semibold tracking-tight first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-5 text-base font-semibold first:mt-0">{children}</h3>,
          p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-border pl-4 text-muted-foreground">{children}</blockquote>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="font-medium underline decoration-border underline-offset-4 hover:decoration-foreground">{children}</a>,
          code: ({ children, className }) => className
            ? <code className={`${className} block overflow-x-auto rounded-xl bg-muted p-4 text-[13px] leading-6`}>{children}</code>
            : <code className="rounded bg-muted px-1.5 py-0.5 text-[0.9em]">{children}</code>,
          table: ({ children }) => <div className="my-4 overflow-x-auto"><table className="w-full border-collapse text-sm">{children}</table></div>,
          th: ({ children }) => <th className="border-b border-border px-3 py-2 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b border-border px-3 py-2 align-top">{children}</td>,
        }}>
        {content}
      </ReactMarkdown>
      {resources.length > 0 && (
        <section className="mt-6" aria-label="Related resources">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4" /> Explore related resources
            <span className="font-normal text-muted-foreground">{resources.length}</span>
          </div>
          <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-3">
            {resources.map((resource) => (
              <GroundedResourceCard key={resource.resource_uuid} resource={resource} orgslug={orgslug} />
            ))}
          </div>
        </section>
      )}
    </article>
  )
}

export default function HubExperience({ orgslug, filters }: { orgslug: string; filters: HubFilters }) {
  const initialQuery = filters.query || filters.q || ''
  const [behavior, setBehavior] = useState<HubBehavior>('auto')
  const [autoView, setAutoView] = useState<AutoView>('discover')
  const [messages, setMessages] = useState<HubAdvisorMessage[]>([])
  const [draft, setDraft] = useState(initialQuery)
  const [searchTypes, setSearchTypes] = useState<HubSearchType[]>(() => initialSearchTypes(filters, initialQuery))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [composerHeight, setComposerHeight] = useState(COMPOSER_MIN_HEIGHT)
  const [composerFades, setComposerFades] = useState({ top: false, bottom: false })
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const showDiscovery = showsHubDiscovery(behavior, autoView)
  const canAsk = hubCanAsk(behavior)

  const updateDraft = (value: string) => {
    const startedTyping = !draft.trim() && Boolean(value.trim())
    setDraft(value)
    if (startedTyping && searchTypes.length === 0) setSearchTypes(['all'])
    if (!value.trim() && searchTypes.includes('all')) setSearchTypes([])
  }

  useEffect(() => {
    const scrollArea = scrollRef.current
    if (!scrollArea) return
    if (showDiscovery) scrollArea.scrollTo({ top: 0 })
    else scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' })
  }, [showDiscovery, draft, searchTypes, messages, sending])

  const updateComposerFades = (textarea: HTMLTextAreaElement) => {
    const hasOverflow = textarea.scrollHeight > textarea.clientHeight + 1
    setComposerFades({
      top: hasOverflow && textarea.scrollTop > 1,
      bottom: hasOverflow && textarea.scrollTop + textarea.clientHeight < textarea.scrollHeight - 1,
    })
  }

  useLayoutEffect(() => {
    const textarea = composerRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, COMPOSER_MIN_HEIGHT), COMPOSER_MAX_HEIGHT)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
    setComposerHeight(nextHeight)
    updateComposerFades(textarea)
  }, [draft, behavior])

  const resetChat = () => {
    setMessages([])
    setDraft('')
    setError('')
    if (behavior === 'auto') setAutoView('discover')
  }

  const changeBehavior = (next: HubBehavior) => {
    const nextAutoView = autoViewAfterBehaviorChange(behavior, next, messages.length > 0)
    if (nextAutoView) setAutoView(nextAutoView)
    setBehavior(next)
    setError('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canAsk) return
    const content = draft.trim()
    if (!content || !accessToken || !org?.id || sending) return
    const previousMessages = messages
    let history = messages.slice(-10)
    while (history.length >= 2 && history.reduce((sum, item) => sum + item.content.length, 0) + content.length > 7_500) {
      history = history.slice(2)
    }
    const requestMessages: HubAdvisorMessage[] = [...history, { role: 'user', content }]
    setMessages(requestMessages)
    updateDraft('')
    setError('')
    if (behavior === 'auto') setAutoView('conversation')
    setSending(true)
    try {
      const response = await askHubAdvisor(org.id, requestMessages, accessToken)
      setMessages((current) => [...current, {
        role: 'assistant',
        content: response.answer,
        resources: response.resources,
      }])
    } catch (requestError: any) {
      const recovery = advisorFailureRecovery(content, searchTypes, 'all' as HubSearchType)
      setMessages(previousMessages)
      setDraft(recovery.draft)
      setSearchTypes(recovery.selectedTypes)
      if (behavior === 'auto') setAutoView(recovery.autoView)
      setError(requestError?.message || 'The advisor is temporarily unavailable. Search is still available.')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="relative mx-auto h-[calc(100dvh-5rem)] w-full max-w-[1056px] overflow-hidden md:h-dvh" aria-label="Hub">
      <h1 className="sr-only">Hub</h1>

      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overscroll-contain scroll-smooth">
        <div
          className="mx-auto min-h-full w-full max-w-4xl px-4 pt-7 sm:px-6 sm:pt-10"
          style={{ paddingBottom: composerHeight + 128 }}
        >
          {showDiscovery ? (
            <div>
              {error && (
                <div className="mb-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                  {error} Your search results are still available below.
                </div>
              )}
              {behavior === 'auto' && messages.length > 0 && (
                <div className="mb-5 flex justify-end">
                  <Button type="button" variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => setAutoView('conversation')}>
                    <Sparkles className="h-4 w-4" /> Return to conversation
                  </Button>
                </div>
              )}
              <HubQuickSearch
                orgslug={orgslug}
                orgId={org?.id}
                orgUUID={org?.org_uuid}
                query={draft}
                selectedTypes={searchTypes}
                resourceFilters={{
                  channel: filters.channel,
                  user_channel: filters.user_channel,
                  resource_types: filters.resource_types,
                  tags: filters.tags,
                  access: filters.access,
                  provider: filters.provider,
                }}
              />
            </div>
          ) : (
            <div className="space-y-7" aria-live="polite" aria-busy={sending}>
              {messages.length > 0 && (
                <div className="flex justify-end">
                  {behavior === 'auto' && (
                    <Button type="button" variant="ghost" size="sm" className="mr-auto gap-2 text-muted-foreground" onClick={() => setAutoView('discover')}>
                      <Search className="h-4 w-4" /> Back to discovery
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={resetChat}>
                    <RotateCcw className="h-4 w-4" /> New chat
                  </Button>
                </div>
              )}
              {messages.map((message, index) => message.role === 'user' ? (
                <div key={`${message.role}-${index}`} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-sm leading-6 text-foreground sm:max-w-[72%]">
                    {message.content}
                  </div>
                </div>
              ) : (
                <AssistantResponse
                  key={`${message.role}-${index}`}
                  content={message.content}
                  resources={message.resources}
                  orgslug={orgslug}
                />
              ))}
              {sending && <div className="text-sm text-muted-foreground" role="status">Thinking…</div>}
              {error && <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-sticky">
        <div aria-hidden="true" className="absolute inset-x-0 -top-10 bottom-0 bg-[linear-gradient(to_bottom,transparent_0%,color-mix(in_srgb,var(--org-page-background)_50%,transparent)_50%,var(--org-page-background)_78%)]" />
        <form onSubmit={submit} className="pointer-events-auto relative mx-auto flex w-full max-w-4xl flex-col justify-end px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="h-10 overflow-hidden">
            <div
              className={`flex h-10 items-center gap-1.5 overflow-x-auto pb-1 transition-opacity ${showDiscovery ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
              aria-hidden={!showDiscovery}
              aria-label="Search content types"
            >
              {HUB_SEARCH_TYPES.filter((item) => item.value !== 'all' || draft.trim()).map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={searchTypes.includes(item.value) ? 'secondary' : 'outline'}
                  className="shrink-0 border-border/70 bg-card px-3 text-muted-foreground shadow-none aria-pressed:text-foreground"
                  aria-pressed={searchTypes.includes(item.value)}
                  tabIndex={showDiscovery ? 0 : -1}
                  onClick={() => setSearchTypes((current) => {
                    if (current.includes(item.value)) return current.filter((value) => value !== item.value)
                    if (item.value === 'all') return ['all']
                    return [...current.filter((value) => value !== 'all'), item.value]
                  })}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-border/80 bg-background/90 p-2 shadow-sm backdrop-blur-md">
            <label htmlFor="hub-composer" className="sr-only">
              {behavior === 'search' ? 'Search Launch LMS' : behavior === 'ask' ? 'Message the Hub advisor' : 'Discover or ask in Hub'}
            </label>
            <div className="relative overflow-hidden rounded-xl">
              <Textarea
                ref={composerRef}
                id="hub-composer"
                value={draft}
                onChange={(event) => updateDraft(event.target.value)}
                onScroll={(event) => updateComposerFades(event.currentTarget)}
                maxLength={2000}
                rows={1}
                placeholder={behavior === 'search' ? 'Search everything…' : behavior === 'ask' ? 'Ask anything…' : 'Search or ask anything…'}
                disabled={sending}
                className="min-h-11 resize-none border-0 bg-transparent px-3 py-2.5 text-base leading-6 shadow-none focus-visible:ring-0"
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey) return
                  event.preventDefault()
                  if (canAsk) event.currentTarget.form?.requestSubmit()
                }}
              />
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-0 top-0 h-7 bg-gradient-to-b from-background via-background/80 to-transparent transition-opacity ${composerFades.top ? 'opacity-100' : 'opacity-0'}`}
              />
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-background via-background/80 to-transparent transition-opacity ${composerFades.bottom ? 'opacity-100' : 'opacity-0'}`}
              />
            </div>
            <div className="flex h-9 items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" disabled title="Add context is not available yet" aria-label="Add context (coming soon)">
                  <Plus className="h-4 w-4" />
                </Button>
                <Select value={behavior} onValueChange={(value) => changeBehavior(value as HubBehavior)}>
                  <SelectTrigger className="h-8 w-[7.25rem] rounded-full border-border/70 bg-muted/60 px-3 text-xs font-medium shadow-none" aria-label="Hub behavior">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="search">Search</SelectItem>
                    <SelectItem value="ask">Ask</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                size="icon"
                className={`h-8 w-8 transition-opacity ${canAsk ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                disabled={!draft.trim() || sending || !accessToken}
                tabIndex={canAsk ? 0 : -1}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </form>
      </div>
    </main>
  )
}
