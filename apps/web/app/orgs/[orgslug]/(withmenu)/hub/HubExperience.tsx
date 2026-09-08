'use client'

import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Plus, Send } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import {
  archiveHubConversation,
  askHubAdvisor,
  getHubMemory,
  getHubConversation,
  HubAdvisorMessage,
  HubMemory,
  HubAdvisorResource,
  HubConversationSummary,
  listHubConversations,
  recordHubSearch,
  renameHubConversation,
  saveHubConversationState,
  updateHubMemorySettings,
} from '@services/hub/advisor'
import { getResource, Resource } from '@services/resources/resources'
import HubQuickSearch from './HubQuickSearch'
import HubHeader from './HubHeader'
import HubHomeRecents from './HubHomeRecents'
import HubMessageMicroBar from './HubMessageMicroBar'
import HubMemoryNotice from './HubMemoryNotice'
import HubResourceContext, { ActiveResourceWorkspace } from './HubResourceContext'
import HubResourceLibrary from './HubResourceLibrary'
import {
  addHubContextResource,
  addHubContextResources,
  buildHubResourceTrayEntries,
  hubAdvisorHistory,
  inferHubResponseKind,
  HubResourceTrayEntry,
  newHubTranscriptResources,
  removeHubContextResource,
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
  conversation?: string
}

type HubConversationMessage = HubAdvisorMessage & {
  id: string
  resourceLabel?: 'You added' | 'Suggested'
  searchQuery?: string
  createdAt?: string
  memories?: HubMemory[]
}

const COMPOSER_LINE_HEIGHT = 24
const COMPOSER_VERTICAL_PADDING = 20
const COMPOSER_MAX_LINES = 8
const COMPOSER_MIN_HEIGHT = COMPOSER_LINE_HEIGHT + COMPOSER_VERTICAL_PADDING
const COMPOSER_MAX_HEIGHT = COMPOSER_LINE_HEIGHT * COMPOSER_MAX_LINES + COMPOSER_VERTICAL_PADDING

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
  const [messages, setMessages] = useState<HubConversationMessage[]>([])
  const [conversationUuid, setConversationUuid] = useState<string | null>(null)
  const [conversationTitle, setConversationTitle] = useState('')
  const [conversations, setConversations] = useState<HubConversationSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [resourcePanelConversationUuid, setResourcePanelConversationUuid] = useState<string | null>(null)
  const [conversationLoading, setConversationLoading] = useState(false)
  const [draft, setDraft] = useState(initialQuery)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [contextResources, setContextResources] = useState<HubAdvisorResource[]>([])
  const [pendingResources, setPendingResources] = useState<HubAdvisorResource[]>([])
  const [activeResourceUuid, setActiveResourceUuid] = useState<string | null>(null)
  const [activeResourceGroupId, setActiveResourceGroupId] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [composerHeight, setComposerHeight] = useState(COMPOSER_MIN_HEIGHT)
  const [composerFades, setComposerFades] = useState({ top: false, bottom: false })
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const [memoryNoticeVisible, setMemoryNoticeVisible] = useState(false)
  const [memorySettingsLoaded, setMemorySettingsLoaded] = useState(false)
  const [memorySettingSaving, setMemorySettingSaving] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const openedResourceRef = useRef('')
  const messageSequenceRef = useRef(0)
  const introducedResourceUuidsRef = useRef(new Set<string>())
  const resourceOriginRefs = useRef(new Map<string, HTMLDivElement>())
  const stateSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const initialPromptSubmittedRef = useRef(false)
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const conversationStarted = Boolean(conversationUuid || messages.length > 0)
  const trayEntries = useMemo(() => buildHubResourceTrayEntries([
    ...messages.map((message) => ({ id: message.id, resources: message.resources })),
    { id: 'pending', resources: pendingResources },
  ]), [messages, pendingResources])

  const setConversationInUrl = (uuid: string | null) => {
    const url = new URL(window.location.href)
    if (uuid) url.searchParams.set('conversation', uuid)
    else url.searchParams.delete('conversation')
    window.history.replaceState({}, '', url)
  }

  const refreshHistory = useCallback(async () => {
    if (!accessToken || !org?.id) return
    setHistoryLoading(true)
    try {
      setConversations(await listHubConversations(org.id, accessToken))
    } catch (historyError: any) {
      setError(historyError?.message || 'Conversation history is unavailable.')
    } finally {
      setHistoryLoading(false)
    }
  }, [accessToken, org?.id])

  useEffect(() => {
    if (!conversationUuid) void refreshHistory()
  }, [conversationUuid, refreshHistory])

  useEffect(() => {
    if (!accessToken || !org?.id) return
    let active = true
    getHubMemory(org.id, accessToken)
      .then((settings) => {
        if (!active) return
        setMemoryEnabled(settings.enabled)
        setMemoryNoticeVisible(!settings.notice_dismissed)
      })
      .catch(() => undefined)
      .finally(() => active && setMemorySettingsLoaded(true))
    return () => { active = false }
  }, [accessToken, org?.id])

  useEffect(() => {
    if (!memorySettingsLoaded || !initialQuery.trim() || initialPromptSubmittedRef.current || !accessToken || !org?.id) return
    initialPromptSubmittedRef.current = true
    composerRef.current?.form?.requestSubmit()
  }, [accessToken, initialQuery, memorySettingsLoaded, org?.id])

  const openConversation = async (uuid: string, openResources = false) => {
    if (!accessToken || !org?.id || sending) return
    setResourcePanelConversationUuid(openResources ? uuid : null)
    setConversationLoading(true)
    setError('')
    try {
      const conversation = await getHubConversation(org.id, uuid, accessToken)
      const restoredMessages = conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        resources: message.resources,
        resourceLabel: message.resource_label,
        searchQuery: message.search_query,
        createdAt: message.created_at,
        memories: message.memories,
      }))
      setMessages(restoredMessages)
      setConversationUuid(conversation.conversation_uuid)
      setConversationTitle(conversation.title)
      setContextResources(conversation.context_resources)
      setPendingResources([])
      setActiveResourceUuid(null)
      setActiveResourceGroupId(null)
      introducedResourceUuidsRef.current = new Set(restoredMessages.flatMap((message) => (message.resources || []).map((resource) => resource.resource_uuid)))
      setConversationInUrl(conversation.conversation_uuid)
    } catch (loadError: any) {
      setError(loadError?.message || 'This conversation could not be opened.')
      if (loadError?.status === 404) setConversationInUrl(null)
    } finally {
      setConversationLoading(false)
    }
  }

  useEffect(() => {
    const requestedConversation = filters.conversation?.trim()
    if (!requestedConversation || !accessToken || !org?.id || conversationUuid === requestedConversation) return
    openConversation(requestedConversation)
    // The URL is the initial deep-link source; later switches call openConversation directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filters.conversation, org?.id])

  const persistState = (nextMessages: HubConversationMessage[], nextContext: HubAdvisorResource[]) => {
    if (!conversationUuid || !accessToken || !org?.id) return
    const uuid = conversationUuid
    const state = {
      context_resource_uuids: nextContext.map((resource) => resource.resource_uuid),
      message_resources: nextMessages
        .filter((message) => message.id.startsWith('hub_message_'))
        .map((message) => ({
          message_uuid: message.id,
          resource_uuids: (message.resources || []).map((resource) => resource.resource_uuid),
          label: message.resourceLabel,
        })),
    }
    stateSaveQueueRef.current = stateSaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveHubConversationState(org.id, uuid, accessToken, state))
      .catch((stateError: any) => {
        setError(stateError?.message || 'Conversation changes could not be saved.')
      })
  }

  useEffect(() => {
    const requestedResource = filters.resource?.trim()
    if (!requestedResource || !accessToken || openedResourceRef.current === requestedResource) return
    openedResourceRef.current = requestedResource
    const resourceUuid = requestedResource.startsWith('resource_') ? requestedResource : `resource_${requestedResource}`
    getResource(resourceUuid, accessToken)
      .then((resource) => {
        const advisorResource = asAdvisorResource(resource)
        introducedResourceUuidsRef.current.add(resource.resource_uuid)
        setContextResources((current) => addHubContextResource(current, advisorResource))
        setPendingResources((current) => addHubContextResource(current, advisorResource))
        setActiveResourceUuid(resource.resource_uuid)
        setActiveResourceGroupId('pending')
      })
      .catch((loadError: any) => setError(loadError?.message || 'This resource is not available.'))
  }, [accessToken, filters.resource])

  useEffect(() => {
    const scrollArea = scrollRef.current
    if (!scrollArea) return
    scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, contextResources, pendingResources, activeResourceUuid, activeResourceGroupId, libraryOpen])

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
  }, [draft])

  const dismissMemoryNotice = useCallback(async () => {
    if (!memoryNoticeVisible) return
    setMemoryNoticeVisible(false)
    if (accessToken && org?.id) {
      try {
        await updateHubMemorySettings(org.id, { notice_dismissed: true }, accessToken)
      } catch {
        // The acknowledgement can be retried on a later visit without blocking Hub.
      }
    }
  }, [accessToken, memoryNoticeVisible, org?.id])

  const changeMemoryEnabled = async (enabled: boolean) => {
    if (!accessToken || !org?.id || memorySettingSaving) return
    setMemorySettingSaving(true)
    setError('')
    try {
      const settings = await updateHubMemorySettings(
        org.id,
        { enabled, notice_dismissed: true },
        accessToken,
      )
      setMemoryEnabled(settings.enabled)
      setMemoryNoticeVisible(false)
    } catch (settingError: any) {
      setError(settingError?.message || 'Your memory setting could not be saved.')
    } finally {
      setMemorySettingSaving(false)
    }
  }

  const resetChat = () => {
    void dismissMemoryNotice()
    setMessages([])
    setConversationUuid(null)
    setConversationTitle('')
    setContextResources([])
    setPendingResources([])
    setActiveResourceUuid(null)
    setActiveResourceGroupId(null)
    introducedResourceUuidsRef.current.clear()
    setDraft('')
    setError('')
    setConversationInUrl(null)
    setResourcePanelConversationUuid(null)
  }

  const addResourceToConversation = (resource: Resource) => {
    const advisorResource = asAdvisorResource(resource)
    introducedResourceUuidsRef.current.add(resource.resource_uuid)
    const nextContext = addHubContextResource(contextResources, advisorResource)
    setContextResources(nextContext)
    setPendingResources((current) => addHubContextResource(current, advisorResource))
    setActiveResourceUuid(resource.resource_uuid)
    setActiveResourceGroupId('pending')
    setLibraryOpen(false)
    persistState(messages, nextContext)
  }

  const inspectSearchResource = (groupId: string, resource: Resource) => {
    const advisorResource = asAdvisorResource(resource)
    const collapseActive = activeResourceGroupId === groupId && activeResourceUuid === resource.resource_uuid
    introducedResourceUuidsRef.current.add(resource.resource_uuid)
    const nextContext = addHubContextResource(contextResources, advisorResource)
    const nextMessages = messages.map((message) => message.id === groupId
      ? { ...message, resources: addHubContextResource(message.resources || [], advisorResource) }
      : message)
    setContextResources(nextContext)
    setMessages(nextMessages)
    setActiveResourceUuid(collapseActive ? null : resource.resource_uuid)
    setActiveResourceGroupId(collapseActive ? null : groupId)
    persistState(nextMessages, nextContext)
  }

  const changeActiveResource = (groupId: string, resources: HubAdvisorResource[], resourceUuid: string | null) => {
    setActiveResourceUuid(resourceUuid)
    setActiveResourceGroupId(resourceUuid ? groupId : null)
    if (resourceUuid) {
      const selected = resources.find((resource) => resource.resource_uuid === resourceUuid)
      if (selected) {
        const nextContext = addHubContextResource(contextResources, selected)
        setContextResources(nextContext)
        persistState(messages, nextContext)
      }
    }
  }

  const removeContextResource = (groupId: string, resourceUuid: string) => {
    const next = removeHubContextResource(contextResources, activeResourceUuid, resourceUuid)
    setContextResources(next.resources)
    setActiveResourceUuid(next.activeResourceUuid)
    if (activeResourceUuid === resourceUuid) setActiveResourceGroupId(null)
    if (groupId === 'pending') {
      setPendingResources((current) => current.filter((resource) => resource.resource_uuid !== resourceUuid))
      persistState(messages, next.resources)
      return
    }
    const nextMessages = messages.map((message) => (
      message.id === groupId
        ? { ...message, resources: message.resources?.filter((resource) => resource.resource_uuid !== resourceUuid) }
        : message
    ))
    setMessages(nextMessages)
    persistState(nextMessages, next.resources)
  }

  const removeResourceEverywhere = (resourceUuid: string) => {
    const next = removeHubContextResource(contextResources, activeResourceUuid, resourceUuid)
    setContextResources(next.resources)
    setActiveResourceUuid(next.activeResourceUuid)
    if (activeResourceUuid === resourceUuid) setActiveResourceGroupId(null)
    setPendingResources((current) => current.filter((resource) => resource.resource_uuid !== resourceUuid))
    const nextMessages = messages.map((message) => ({
      ...message,
      resources: message.resources?.filter((resource) => resource.resource_uuid !== resourceUuid),
    }))
    setMessages(nextMessages)
    persistState(nextMessages, next.resources)
  }

  const returnToResourceOrigin = ({ resource, originGroupId }: HubResourceTrayEntry<HubAdvisorResource>) => {
    setActiveResourceUuid(resource.resource_uuid)
    setActiveResourceGroupId(originGroupId)
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const origin = resourceOriginRefs.current.get(originGroupId)
      origin?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      origin?.focus({ preventScroll: true })
    }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || !accessToken || !org?.id || sending) return
    void dismissMemoryNotice()
    const previousMessages = messages
    let history: HubAdvisorMessage[] = hubAdvisorHistory(messages)
    while (history.length >= 2 && history.reduce((sum, item) => sum + item.content.length, 0) + content.length > 7_500) {
      history = history.slice(2)
    }
    const requestMessages: HubAdvisorMessage[] = [...history, { role: 'user', content }]
    if (!conversationUuid) {
      const normalizedTitle = content.replace(/\s+/g, ' ').trim()
      setConversationTitle(normalizedTitle.length <= 80 ? normalizedTitle : `${normalizedTitle.slice(0, 77).trimEnd()}…`)
    }
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
    setDraft('')
    setError('')
    setSending(true)
    if (inferHubResponseKind(content) === 'search') {
      try {
        const persisted = await recordHubSearch(org.id, content, accessToken, {
          conversationUuid: conversationUuid || undefined,
          resourceUuids: contextResources.map((resource) => resource.resource_uuid),
          learnerResourceUuids: submittedResources.map((resource) => resource.resource_uuid),
        })
        const nextMessages: HubConversationMessage[] = [
          ...previousMessages,
          { id: persisted.user_message_uuid, role: 'user', content, resources: submittedResources, resourceLabel: submittedResources.length ? 'You added' : undefined, createdAt: persisted.user_message_created_at },
          { id: persisted.assistant_message_uuid, role: 'assistant', content: '', searchQuery: content, createdAt: persisted.assistant_message_created_at },
        ]
        setMessages(nextMessages)
        setConversationUuid(persisted.conversation_uuid)
        setConversationTitle(persisted.title)
        setConversationInUrl(persisted.conversation_uuid)
        await refreshHistory()
      } catch (requestError: any) {
        setMessages(previousMessages)
        setPendingResources(submittedResources)
        setDraft(content)
        setError(requestError?.message || 'The search could not be saved. Your message has been restored.')
      } finally {
        setSending(false)
      }
      return
    }
    try {
      const response = await askHubAdvisor(
        org.id,
        requestMessages,
        accessToken,
        contextResources.map((resource) => resource.resource_uuid),
        conversationUuid || undefined,
        submittedResources.map((resource) => resource.resource_uuid)
      )
      const transcriptResources = newHubTranscriptResources(introducedResourceUuidsRef.current, response.resources)
      transcriptResources.forEach((resource) => introducedResourceUuidsRef.current.add(resource.resource_uuid))
      const nextMessages: HubConversationMessage[] = [
        ...previousMessages,
        { id: response.user_message_uuid, role: 'user', content, resources: submittedResources, resourceLabel: submittedResources.length ? 'You added' : undefined, createdAt: response.user_message_created_at, memories: response.memory_changes },
        { id: response.assistant_message_uuid, role: 'assistant', content: response.answer, resources: transcriptResources, resourceLabel: transcriptResources.length ? 'Suggested' : undefined, createdAt: response.assistant_message_created_at, memories: response.memories_used },
      ]
      setMessages(nextMessages)
      setContextResources((current) => addHubContextResources(current, response.resources))
      setConversationUuid(response.conversation_uuid)
      setConversationTitle(response.title)
      setConversationInUrl(response.conversation_uuid)
      await refreshHistory()
    } catch (requestError: any) {
      setMessages(previousMessages)
      setPendingResources(submittedResources)
      if (submittedResources.length > 0) setActiveResourceGroupId('pending')
      setDraft(content)
      setError(requestError?.message || 'The advisor is temporarily unavailable. Your message has been restored.')
    } finally {
      setSending(false)
    }
  }

  const renameConversation = async (uuid: string, title: string) => {
    if (!accessToken || !org?.id) return
    try {
      const updated = await renameHubConversation(org.id, uuid, title, accessToken)
      setConversations((current) => current.map((item) => item.conversation_uuid === uuid
        ? { ...item, title: updated.title, updated_at: new Date().toISOString() }
        : item))
      if (conversationUuid === uuid) setConversationTitle(updated.title)
    } catch (renameError: any) {
      setError(renameError?.message || 'This conversation could not be renamed.')
      throw renameError
    }
  }

  const archiveConversation = async () => {
    const uuid = conversationUuid
    if (!uuid || !accessToken || !org?.id) return
    try {
      await stateSaveQueueRef.current.catch(() => undefined)
      await archiveHubConversation(org.id, uuid, accessToken)
      setConversations((current) => current.filter((item) => item.conversation_uuid !== uuid))
      resetChat()
    } catch (archiveError: any) {
      setError(archiveError?.message || 'This conversation could not be archived.')
    }
  }

  return (
    <main className="relative mx-auto h-[calc(100dvh-5rem)] w-full max-w-[1056px] overflow-hidden md:h-dvh" aria-label="Hub">
      <h1 className="sr-only">{conversationTitle || 'Hub'}</h1>
      {conversationStarted && (
        <HubHeader
          key={`${conversationUuid}:${resourcePanelConversationUuid === conversationUuid ? 'resources' : 'conversation'}`}
          orgslug={orgslug}
          conversationUuid={conversationUuid}
          conversationStarted={conversationStarted}
          title={conversationTitle}
          conversations={conversations}
          entries={trayEntries}
          loading={historyLoading}
          disabled={sending || conversationLoading}
          onHistoryOpen={refreshHistory}
          onBack={resetChat}
          onNew={resetChat}
          onSelect={openConversation}
          onOpenResources={(uuid) => void openConversation(uuid, true)}
          onRename={(title) => conversationUuid ? renameConversation(conversationUuid, title) : Promise.resolve()}
          onArchive={archiveConversation}
          onRemoveResource={removeResourceEverywhere}
          onReturnToOrigin={returnToResourceOrigin}
          initialPanel={resourcePanelConversationUuid === conversationUuid ? 'resources' : null}
        />
      )}

      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overscroll-contain scroll-smooth">
        <div
          className={`mx-auto min-h-full w-full max-w-3xl px-4 sm:px-6 ${conversationStarted ? 'pt-16' : 'pt-7 sm:pt-10'}`}
          style={{ paddingBottom: composerHeight + 88 + (memoryNoticeVisible ? 148 : 0) + (libraryOpen ? 290 : 0) }}
        >
          <div className="space-y-7" aria-live="polite" aria-busy={sending || conversationLoading}>
            {!conversationUuid && messages.length === 0 && (
              <HubHomeRecents
                conversations={conversations}
                loading={historyLoading}
                disabled={sending || conversationLoading}
                onHistoryOpen={refreshHistory}
                onSelect={openConversation}
                onOpenResources={(uuid) => void openConversation(uuid, true)}
              />
            )}
            {conversationLoading && <div className="py-16 text-center text-sm text-muted-foreground" role="status">Loading conversation…</div>}
              {messages.map((message) => message.role === 'user' ? (
                <div key={message.id} className="space-y-1.5">
                  {message.resources && message.resources.length > 0 && (
                    <div ref={(node) => { if (node) resourceOriginRefs.current.set(message.id, node); else resourceOriginRefs.current.delete(message.id) }} tabIndex={-1} className="rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                      <HubResourceContext
                        resources={message.resources}
                        activeResourceUuid={activeResourceGroupId === message.id ? activeResourceUuid : null}
                        onActiveChange={(resourceUuid) => changeActiveResource(message.id, message.resources || [], resourceUuid)}
                        onRemove={(resourceUuid) => removeContextResource(message.id, resourceUuid)}
                        orgslug={orgslug}
                        label={message.resourceLabel}
                      />
                    </div>
                  )}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-sm leading-6 text-foreground sm:max-w-[72%]">
                      {message.content}
                    </div>
                  </div>
                  {accessToken && org?.id && <HubMessageMicroBar role="user" content={message.content} createdAt={message.createdAt} memories={message.memories} orgId={org.id} accessToken={accessToken} />}
                </div>
              ) : (
                <div key={message.id} className="space-y-1.5">
                  {message.searchQuery ? (
                    <div ref={(node) => { if (node) resourceOriginRefs.current.set(message.id, node); else resourceOriginRefs.current.delete(message.id) }} tabIndex={-1} className="space-y-1.5 rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                      <HubQuickSearch
                        orgId={org?.id}
                        orgUUID={org?.org_uuid}
                        query={message.searchQuery}
                        resourceFilters={{
                          channel: filters.channel,
                          user_channel: filters.user_channel,
                          resource_types: filters.resource_types,
                          tags: filters.tags,
                          access: filters.access,
                          provider: filters.provider,
                        }}
                        selectedResourceUuids={(message.resources || []).map((resource) => resource.resource_uuid)}
                        onSelectResource={(resource) => inspectSearchResource(message.id, resource)}
                      />
                      {activeResourceGroupId === message.id && (message.resources || [])
                        .filter((resource) => resource.resource_uuid === activeResourceUuid)
                        .map((resource) => <div key={resource.resource_uuid} className="mt-2"><ActiveResourceWorkspace resource={resource} orgslug={orgslug} /></div>)}
                      {accessToken && org?.id && <HubMessageMicroBar role="assistant" content={`Resource search results for ${message.searchQuery}`} createdAt={message.createdAt} memories={message.memories} orgId={org.id} accessToken={accessToken} />}
                    </div>
                  ) : (
                    <>
                      <AssistantResponse content={message.content} />
                      {accessToken && org?.id && <HubMessageMicroBar role="assistant" content={message.content} createdAt={message.createdAt} memories={message.memories} orgId={org.id} accessToken={accessToken} />}
                      {message.resources && message.resources.length > 0 && (
                        <div ref={(node) => { if (node) resourceOriginRefs.current.set(message.id, node); else resourceOriginRefs.current.delete(message.id) }} tabIndex={-1} className="rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                      <HubResourceContext
                        resources={message.resources}
                        activeResourceUuid={activeResourceGroupId === message.id ? activeResourceUuid : null}
                        onActiveChange={(resourceUuid) => changeActiveResource(message.id, message.resources || [], resourceUuid)}
                        onRemove={(resourceUuid) => removeContextResource(message.id, resourceUuid)}
                        orgslug={orgslug}
                        label={message.resourceLabel}
                      />
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              {pendingResources.length > 0 && (
                <div ref={(node) => { if (node) resourceOriginRefs.current.set('pending', node); else resourceOriginRefs.current.delete('pending') }} tabIndex={-1} className="rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                  <HubResourceContext
                    resources={pendingResources}
                    activeResourceUuid={activeResourceGroupId === 'pending' ? activeResourceUuid : null}
                    onActiveChange={(resourceUuid) => changeActiveResource('pending', pendingResources, resourceUuid)}
                    onRemove={(resourceUuid) => removeContextResource('pending', resourceUuid)}
                    orgslug={orgslug}
                    label="You added"
                  />
                </div>
              )}
              {sending && <div className="text-sm text-muted-foreground" role="status">Thinking…</div>}
              {error && <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[var(--z-sticky-header)]">
        <div aria-hidden="true" className="absolute inset-x-0 -top-10 bottom-0 bg-[linear-gradient(to_bottom,transparent_0%,color-mix(in_srgb,var(--org-page-background)_50%,transparent)_50%,var(--org-page-background)_78%)]" />
        <div className="pointer-events-auto relative mx-auto w-full max-w-[50rem] px-4 pb-4 sm:px-5 sm:pb-6">
        {memoryNoticeVisible && (
          <HubMemoryNotice
            orgslug={orgslug}
            enabled={memoryEnabled}
            saving={memorySettingSaving}
            onEnabledChange={(enabled) => void changeMemoryEnabled(enabled)}
            onDismiss={() => void dismissMemoryNotice()}
            onLearnMore={(href) => {
              void dismissMemoryNotice().finally(() => window.location.assign(href))
            }}
          />
        )}
        <form onSubmit={submit} className="flex flex-col justify-end">
          <div className="rounded-[1.6rem] border border-border/80 bg-background/90 p-2 shadow-sm backdrop-blur-md">
            <label htmlFor="hub-composer" className="sr-only">Ask a question or search Launch LMS</label>
            <div className="relative overflow-hidden rounded-xl">
              <Textarea
                ref={composerRef}
                id="hub-composer"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onScroll={(event) => updateComposerFades(event.currentTarget)}
                maxLength={2000}
                rows={1}
                placeholder="Ask a question or search for resources…"
                disabled={sending}
                className="min-h-11 resize-none border-0 bg-transparent px-3 py-2.5 text-base leading-6 shadow-none focus-visible:ring-0"
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey) return
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
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
              </div>
              <Button
                type="submit"
                size="icon"
                className="h-8 w-8"
                disabled={!draft.trim() || sending || !accessToken}
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
