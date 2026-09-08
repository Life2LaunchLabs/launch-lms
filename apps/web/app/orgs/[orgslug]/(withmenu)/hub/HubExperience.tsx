'use client'

import { FormEvent, Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus, RotateCcw, Search, Send, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { Textarea } from '@components/ui/textarea'
import { askHubAdvisor, HubAdvisorMessage, HubAdvisorResource } from '@services/hub/advisor'
import { getResource, Resource } from '@services/resources/resources'
import HubQuickSearch, { HubSearchType, HUB_SEARCH_TYPES } from './HubQuickSearch'
import HubResourceContext from './HubResourceContext'
import HubResourceLibrary from './HubResourceLibrary'
import {
  addHubContextResource,
  addHubContextResources,
  advisorFailureRecovery,
  autoViewAfterBehaviorChange,
  hubCanAsk,
  HubBehavior,
  removeHubContextResource,
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
  resource?: string
}

type HubConversationMessage = HubAdvisorMessage & {
  id: string
  resourceLabel?: 'You added' | 'Suggested'
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

function AssistantResponse({ content }: { content: string }) {
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
    </article>
  )
}

function asAdvisorResource(resource: Resource): HubAdvisorResource {
  return {
    resource_uuid: resource.resource_uuid,
    title: resource.title,
    description: resource.description,
    resource_type: resource.resource_type,
    provider_name: resource.provider_name,
    external_url: resource.external_url,
    cover_image_url: resource.cover_image_url,
    thumbnail_image: resource.thumbnail_image,
    owner_org_uuid: resource.owner_org_uuid || null,
    access_mode: resource.access_mode,
    tags: resource.tags.map((tag) => tag.name),
  }
}

export default function HubExperience({ orgslug, filters }: { orgslug: string; filters: HubFilters }) {
  const initialQuery = filters.query || filters.q || ''
  const [behavior, setBehavior] = useState<HubBehavior>('auto')
  const [autoView, setAutoView] = useState<AutoView>('discover')
  const [messages, setMessages] = useState<HubConversationMessage[]>([])
  const [draft, setDraft] = useState(initialQuery)
  const [searchTypes, setSearchTypes] = useState<HubSearchType[]>(() => initialSearchTypes(filters, initialQuery))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [contextResources, setContextResources] = useState<HubAdvisorResource[]>([])
  const [pendingResources, setPendingResources] = useState<HubAdvisorResource[]>([])
  const [activeResourceUuid, setActiveResourceUuid] = useState<string | null>(null)
  const [activeResourceGroupId, setActiveResourceGroupId] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [composerHeight, setComposerHeight] = useState(COMPOSER_MIN_HEIGHT)
  const [composerFades, setComposerFades] = useState({ top: false, bottom: false })
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const openedResourceRef = useRef('')
  const messageSequenceRef = useRef(0)
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const showDiscovery = showsHubDiscovery(behavior, autoView)
  const canAsk = hubCanAsk(behavior)

  useEffect(() => {
    const requestedResource = filters.resource?.trim()
    if (!requestedResource || !accessToken || openedResourceRef.current === requestedResource) return
    openedResourceRef.current = requestedResource
    const resourceUuid = requestedResource.startsWith('resource_') ? requestedResource : `resource_${requestedResource}`
    getResource(resourceUuid, accessToken)
      .then((resource) => {
        const advisorResource = asAdvisorResource(resource)
        setContextResources((current) => addHubContextResource(current, advisorResource))
        setPendingResources((current) => addHubContextResource(current, advisorResource))
        setActiveResourceUuid(resource.resource_uuid)
        setActiveResourceGroupId('pending')
        setBehavior('auto')
        setAutoView('conversation')
      })
      .catch((loadError: any) => setError(loadError?.message || 'This resource is not available.'))
  }, [accessToken, filters.resource])

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
  }, [showDiscovery, draft, searchTypes, messages, sending, contextResources, pendingResources, activeResourceUuid, activeResourceGroupId, libraryOpen])

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
    setContextResources([])
    setPendingResources([])
    setActiveResourceUuid(null)
    setActiveResourceGroupId(null)
    setDraft('')
    setError('')
    if (behavior === 'auto') setAutoView('discover')
  }

  const addResourceToConversation = (resource: Resource) => {
    const advisorResource = asAdvisorResource(resource)
    setContextResources((current) => addHubContextResource(current, advisorResource))
    setPendingResources((current) => addHubContextResource(current, advisorResource))
    setActiveResourceUuid(resource.resource_uuid)
    setActiveResourceGroupId('pending')
    setLibraryOpen(false)
    setBehavior('auto')
    setAutoView('conversation')
  }

  const changeActiveResource = (groupId: string, resources: HubAdvisorResource[], resourceUuid: string | null) => {
    setActiveResourceUuid(resourceUuid)
    setActiveResourceGroupId(resourceUuid ? groupId : null)
    if (resourceUuid) {
      const selected = resources.find((resource) => resource.resource_uuid === resourceUuid)
      if (selected) setContextResources((current) => addHubContextResource(current, selected))
    }
  }

  const removeContextResource = (groupId: string, resourceUuid: string) => {
    const next = removeHubContextResource(contextResources, activeResourceUuid, resourceUuid)
    setContextResources(next.resources)
    setActiveResourceUuid(next.activeResourceUuid)
    if (activeResourceUuid === resourceUuid) setActiveResourceGroupId(null)
    if (groupId === 'pending') {
      setPendingResources((current) => current.filter((resource) => resource.resource_uuid !== resourceUuid))
      return
    }
    setMessages((current) => current.map((message) => (
      message.id === groupId
        ? { ...message, resources: message.resources?.filter((resource) => resource.resource_uuid !== resourceUuid) }
        : message
    )))
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
    let history: HubAdvisorMessage[] = messages.slice(-10).map(({ role, content }) => ({ role, content }))
    while (history.length >= 2 && history.reduce((sum, item) => sum + item.content.length, 0) + content.length > 7_500) {
      history = history.slice(2)
    }
    const requestMessages: HubAdvisorMessage[] = [...history, { role: 'user', content }]
    messageSequenceRef.current += 1
    const userMessageId = `user-${messageSequenceRef.current}`
    const submittedResources = pendingResources
    setMessages((current) => [...current, {
      id: userMessageId,
      role: 'user',
      content,
      resources: submittedResources,
      resourceLabel: submittedResources.length ? 'You added' : undefined,
    }])
    setPendingResources([])
    if (activeResourceGroupId === 'pending') setActiveResourceGroupId(userMessageId)
    updateDraft('')
    setError('')
    if (behavior === 'auto') setAutoView('conversation')
    setSending(true)
    try {
      const response = await askHubAdvisor(
        org.id,
        requestMessages,
        accessToken,
        contextResources.map((resource) => resource.resource_uuid)
      )
      messageSequenceRef.current += 1
      setMessages((current) => [...current, {
        id: `assistant-${messageSequenceRef.current}`,
        role: 'assistant',
        content: response.answer,
        resources: response.resources,
        resourceLabel: response.resources.length ? 'Suggested' : undefined,
      }])
      setContextResources((current) => addHubContextResources(current, response.resources))
    } catch (requestError: any) {
      const recovery = advisorFailureRecovery(content, searchTypes, 'all' as HubSearchType)
      setMessages(previousMessages)
      setPendingResources(submittedResources)
      if (submittedResources.length > 0) setActiveResourceGroupId('pending')
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
          className="mx-auto min-h-full w-full max-w-3xl px-4 pt-7 sm:px-6 sm:pt-10"
          style={{ paddingBottom: composerHeight + 128 + (libraryOpen ? 290 : 0) }}
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
                onSelectResource={addResourceToConversation}
              />
            </div>
          ) : (
            <div className="space-y-7" aria-live="polite" aria-busy={sending}>
              {(messages.length > 0 || contextResources.length > 0) && (
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
              {messages.map((message) => message.role === 'user' ? (
                <Fragment key={message.id}>
                  {message.resources && message.resources.length > 0 && (
                    <HubResourceContext
                      resources={message.resources}
                      activeResourceUuid={activeResourceGroupId === message.id ? activeResourceUuid : null}
                      onActiveChange={(resourceUuid) => changeActiveResource(message.id, message.resources || [], resourceUuid)}
                      onRemove={(resourceUuid) => removeContextResource(message.id, resourceUuid)}
                      orgslug={orgslug}
                      label={message.resourceLabel}
                    />
                  )}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-sm leading-6 text-foreground sm:max-w-[72%]">
                      {message.content}
                    </div>
                  </div>
                </Fragment>
              ) : (
                <Fragment key={message.id}>
                  <AssistantResponse content={message.content} />
                  {message.resources && message.resources.length > 0 && (
                    <HubResourceContext
                      resources={message.resources}
                      activeResourceUuid={activeResourceGroupId === message.id ? activeResourceUuid : null}
                      onActiveChange={(resourceUuid) => changeActiveResource(message.id, message.resources || [], resourceUuid)}
                      onRemove={(resourceUuid) => removeContextResource(message.id, resourceUuid)}
                      orgslug={orgslug}
                      label={message.resourceLabel}
                    />
                  )}
                </Fragment>
              ))}
              {pendingResources.length > 0 && (
                <HubResourceContext
                  resources={pendingResources}
                  activeResourceUuid={activeResourceGroupId === 'pending' ? activeResourceUuid : null}
                  onActiveChange={(resourceUuid) => changeActiveResource('pending', pendingResources, resourceUuid)}
                  onRemove={(resourceUuid) => removeContextResource('pending', resourceUuid)}
                  orgslug={orgslug}
                  label="You added"
                />
              )}
              {sending && <div className="text-sm text-muted-foreground" role="status">Thinking…</div>}
              {error && <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-sticky">
        <div aria-hidden="true" className="absolute inset-x-0 -top-10 bottom-0 bg-[linear-gradient(to_bottom,transparent_0%,color-mix(in_srgb,var(--org-page-background)_50%,transparent)_50%,var(--org-page-background)_78%)]" />
        <div className="pointer-events-auto relative mx-auto w-full max-w-[50rem] px-4 pb-4 sm:px-5 sm:pb-6">
        <form onSubmit={submit} className="flex flex-col justify-end">
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
                <Button type="button" size="icon" variant={libraryOpen ? 'secondary' : 'ghost'} className="h-8 w-8 text-muted-foreground" onClick={() => setLibraryOpen((current) => !current)} disabled={!accessToken || !org?.id} title="Add resources from your Library" aria-label="Add resource context" aria-expanded={libraryOpen}>
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
        <HubResourceLibrary
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          orgslug={orgslug}
          orgId={org?.id}
          accessToken={accessToken}
          onSelect={addResourceToConversation}
        />
        </div>
      </div>
    </main>
  )
}
