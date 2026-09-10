'use client'

import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, Loader2, Plus, Send, Square } from 'lucide-react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useHubWorkspace } from '@components/Contexts/HubWorkspaceContext'
import { PageTitleRegistration, usePageTitle } from '@components/Contexts/PageTitleContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import {
  archiveHubConversation,
  askHubAdvisor,
  concludeHubEditRun,
  getActiveHubEditRun,
  getHubMemory,
  getHubConversation,
  HubAdvisorMessage,
  HubEditOperation,
  HubMemory,
  HubAdvisorResource,
  HubConversationSummary,
  HubSuggestedAction,
  listHubConversations,
  recordHubSearch,
  renameHubConversation,
  resolveHubSuggestedAction,
  saveHubConversationState,
  updateHubMemorySettings,
} from '@services/hub/advisor'
import { getResource, Resource } from '@services/resources/resources'
import { getUriWithOrg } from '@services/config/config'
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
  restoreSubmittedDraft,
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
  suggestedActions?: HubSuggestedAction[]
}

function recoverHubEditOperations(run: NonNullable<ReturnType<typeof useHubWorkspace>>['editRun']): HubEditOperation[] {
  if (!run) return []
  const stateByKey = new Map(run.objects.map((item) => [item.object_key, item]))
  return run.events.flatMap((event) => {
    const operation = event.payload?.operation
    if (!operation || typeof operation !== 'object' || !('type' in operation)) return []
    if (operation.type === 'set_new_plan_details' && stateByKey.get('new-plan')?.status !== 'editing' && stateByKey.has('new-plan')) return []
    if (operation.type === 'add_plan_objectives' && 'objectives' in operation && Array.isArray(operation.objectives)) {
      const objectives = operation.objectives.filter((objective: any) => !stateByKey.has(objective.local_id) || stateByKey.get(objective.local_id)?.status === 'editing')
      return objectives.length ? [{ ...operation, objectives } as HubEditOperation] : []
    }
    if (operation.type === 'add_plan_phases' && 'phases' in operation && Array.isArray(operation.phases)) {
      const phases = operation.phases.filter((phase: any) => !stateByKey.has(phase.local_id) || stateByKey.get(phase.local_id)?.status === 'editing')
      return phases.length ? [{ ...operation, phases } as HubEditOperation] : []
    }
    return [operation as HubEditOperation]
  })
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

function HubEditActivity({ run, onPoint }: { run: NonNullable<ReturnType<typeof useHubWorkspace>>['editRun']; onPoint: (targetId: string) => void }) {
  const events = (run?.events || []).filter((event) => !event.transient && !event.kind.startsWith('run.'))
  if (!events.length) return null
  const latest = events[events.length - 1]
  const targetFor = (event: (typeof events)[number]) => {
    if (event.kind === 'plan.proposed') return 'hub-edit-new-plan'
    if (event.kind === 'objectives.proposed') {
      const operation = event.payload?.operation as { objectives?: Array<{ local_id?: string }> } | undefined
      const localId = operation?.objectives?.[0]?.local_id
      if (localId) return `hub-edit-objective-${localId}`
    }
    if (event.kind === 'phases.proposed') {
      const operation = event.payload?.operation as { phases?: Array<{ local_id?: string }> } | undefined
      const localId = operation?.phases?.[0]?.local_id
      if (localId) return `hub-edit-phase-${localId}`
    }
    if (!event.object_uuid) return ''
    return event.object_type === 'phase' ? `plan-phase-${event.object_uuid}` : `hub-object-${event.object_uuid}`
  }
  const eventLine = (event: (typeof events)[number]) => {
    const targetId = targetFor(event)
    return <button key={event.event_uuid} type="button" disabled={!targetId} onClick={() => targetId && onPoint(targetId)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground"><span className="truncate">{event.summary}</span>{targetId ? <ArrowRight size={12} className="shrink-0" /> : null}</button>
  }
  const line = eventLine(latest)
  return <div className="rounded-xl border border-border/70 bg-muted/25 p-1.5" aria-label="Hub editing activity">
    {events.length > 1 ? <details><summary className="cursor-pointer list-none px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{events.length} editing activities</summary><div className="mt-1 space-y-0.5">{events.slice(0, -1).map(eventLine)}</div>{line}</details> : line}
  </div>
}

// eslint-disable-next-line no-unused-vars
function HubSuggestedActions({ actions, disabled = false, onActivate }: { actions: HubSuggestedAction[]; disabled?: boolean; onActivate: (action: HubSuggestedAction, mode: 'navigate' | 'edit') => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null)
  if (!actions.length) return null
  return <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Suggested next actions" data-testid="hub-suggested-actions">
    {actions.map((action) => action.primary_behavior === 'begin_edit' ? <div key={action.action_id} className="inline-flex overflow-hidden rounded-lg border border-border bg-background shadow-xs">
      <Button type="button" variant="ghost" size="sm" className="h-8 rounded-none border-0 px-3 text-xs font-semibold" disabled={disabled || busy !== null} onClick={async () => { setBusy(action.action_id); try { await onActivate(action, 'edit') } finally { setBusy(null) } }}>
        {busy === action.action_id ? <Loader2 size={13} className="animate-spin" /> : null}
        {action.primary_label || action.label}
        {busy !== action.action_id ? <ArrowRight size={13} aria-hidden="true" /> : null}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-none border-0 border-l border-border" disabled={disabled || busy !== null} aria-label={`More options for ${action.primary_label || action.label}`}><ChevronDown size={13} /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void onActivate(action, 'navigate')}>{action.alternate_label || 'Open without editing'}</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
    </div> : <Button
      key={action.action_id}
      type="button"
      variant="outline"
      size="sm"
      className="h-8 rounded-lg bg-background px-3 text-xs font-semibold shadow-xs"
      disabled={disabled || busy !== null}
      onClick={async () => {
        setBusy(action.action_id)
        try { await onActivate(action, 'navigate') } finally { setBusy(null) }
      }}
    >
      {busy === action.action_id ? <Loader2 size={13} className="animate-spin" /> : null}
      {action.label}
      {busy !== action.action_id ? <ArrowRight size={13} aria-hidden="true" /> : null}
    </Button>)}
  </div>
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

export default function HubExperience({ orgslug, filters, companion = false, visible = true, onCompanionCollapse, onCompanionExpand }: { orgslug: string; filters: HubFilters; companion?: boolean; visible?: boolean; onCompanionCollapse?: () => void; onCompanionExpand?: () => void }) {
  const router = useRouter()
  const workspace = useHubWorkspace()
  const pageTitle = usePageTitle()
  const alive = useRef(true)
  const loadSequence = useRef(0)
  useEffect(() => { alive.current = true; return () => { alive.current = false; loadSequence.current += 1 } }, [])
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
  const advisorAbortRef = useRef<AbortController | null>(null)
  const pendingSubmissionRef = useRef<{ content: string; preserveDraft: boolean; allowHidden?: boolean } | null>(null)
  const continuationInFlightRef = useRef<string | null>(null)
  const attemptedContinuationsRef = useRef(new Set<string>())
  const automaticallyStartedRunsRef = useRef(new Set<string>())
  const initialPromptSubmittedRef = useRef(false)
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const storageKey = `launchlms:hub-thread:${org?.id}:${session?.data?.user?.id}`
  const restoredRef = useRef(false)
  const conversationStarted = Boolean(conversationUuid || messages.length > 0)
  const trayEntries = useMemo(() => buildHubResourceTrayEntries([
    ...messages.map((message) => ({ id: message.id, resources: message.resources })),
    { id: 'pending', resources: pendingResources },
  ]), [messages, pendingResources])

  const setConversationInUrl = (uuid: string | null) => {
    if (!alive.current) return
    try { if (uuid) sessionStorage.setItem(storageKey, uuid); else sessionStorage.removeItem(storageKey) } catch { /* storage is optional */ }
    const url = new URL(window.location.href)
    if (!/\/hub\/?$/.test(url.pathname)) return
    if (uuid) url.searchParams.set('conversation', uuid)
    else url.searchParams.delete('conversation')
    window.history.replaceState({}, '', url)
  }

  const refreshHistory = useCallback(async () => {
    if (!accessToken || !org?.id) return
    setHistoryLoading(true)
    try {
      const history = await listHubConversations(org.id, accessToken)
      if (alive.current) setConversations(history)
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
    const load = ++loadSequence.current
    setResourcePanelConversationUuid(openResources ? uuid : null)
    setConversationLoading(true)
    setError('')
    try {
      const conversation = await getHubConversation(org.id, uuid, accessToken)
      if (!alive.current || load !== loadSequence.current) return
      const restoredMessages = conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        resources: message.resources,
        resourceLabel: message.resource_label,
        searchQuery: message.search_query,
        createdAt: message.created_at,
        memories: message.memories,
        page_context: message.page_context,
        suggestedActions: message.suggested_actions,
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
      getActiveHubEditRun(org.id, uuid, accessToken)
        .then((active) => {
          if (!alive.current || load !== loadSequence.current) return
          workspace?.setEditRun(active.edit_run)
          workspace?.setEditOperations(recoverHubEditOperations(active.edit_run))
        })
        .catch(() => { if (alive.current && load === loadSequence.current) workspace?.setEditRun(null) })
    } catch (loadError: any) {
      if (!alive.current || load !== loadSequence.current) return
      setError(loadError?.message || 'This conversation could not be opened.')
      if (loadError?.status === 404) setConversationInUrl(null)
    } finally {
      if (alive.current && load === loadSequence.current) setConversationLoading(false)
    }
  }

  useEffect(() => {
    const requestedConversation = filters.conversation?.trim()
    if (!requestedConversation || !accessToken || !org?.id || conversationUuid === requestedConversation) return
    openConversation(requestedConversation)
    // The URL is the initial deep-link source; later switches call openConversation directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filters.conversation, org?.id])

  useEffect(() => {
    if (restoredRef.current || !accessToken || !org?.id) return
    restoredRef.current = true
    if (filters.conversation) return
    try {
      const uuid = sessionStorage.getItem(storageKey)
      if (uuid) void openConversation(uuid)
    } catch { /* conversation history remains available without session storage */ }
    // Restore once per authenticated workspace; explicit Hub links take precedence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, org?.id, storageKey])

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
    workspace?.setEditRun(null)
    workspace?.setEditOperations([])
    workspace?.setEditReviewItems([])
    workspace?.clearEditContinuations(workspace.editRun?.run_uuid)
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
    const pendingSubmission = pendingSubmissionRef.current
    pendingSubmissionRef.current = null
    const content = (pendingSubmission?.content || draft).trim()
    if (!content || !accessToken || !org?.id || sending || conversationLoading || (!visible && !pendingSubmission?.allowHidden)) return
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
    if (!pendingSubmission?.preserveDraft) setDraft('')
    setError('')
    setSending(true)
    const controller = new AbortController()
    advisorAbortRef.current = controller
    if (inferHubResponseKind(content) === 'search') {
      try {
        const searchSurface = {
          ...(companion && workspace?.surface?.hint ? workspace.surface.hint : { surface: 'unsupported' as const }),
          page_path: `${window.location.pathname}${window.location.search}`,
          page_title: pageTitle?.title || document.title,
        }
        const persisted = await recordHubSearch(org.id, content, accessToken, {
          conversationUuid: conversationUuid || undefined,
          resourceUuids: contextResources.map((resource) => resource.resource_uuid),
          learnerResourceUuids: submittedResources.map((resource) => resource.resource_uuid),
          surface: searchSurface,
          signal: controller.signal,
        })
        if (!alive.current) return
        const nextMessages: HubConversationMessage[] = [
          ...previousMessages,
          { id: persisted.user_message_uuid, role: 'user', content, resources: submittedResources, resourceLabel: submittedResources.length ? 'You added' : undefined, createdAt: persisted.user_message_created_at, page_context: persisted.page_context },
          { id: persisted.assistant_message_uuid, role: 'assistant', content: '', searchQuery: content, createdAt: persisted.assistant_message_created_at, page_context: persisted.page_context },
        ]
        setMessages(nextMessages)
        setConversationUuid(persisted.conversation_uuid)
        setConversationTitle(persisted.title)
        setConversationInUrl(persisted.conversation_uuid)
        await refreshHistory()
      } catch (requestError: any) {
        setMessages(previousMessages)
        setPendingResources(submittedResources)
        if (!pendingSubmission?.preserveDraft) setDraft((current) => restoreSubmittedDraft(current, content))
        if (requestError?.name !== 'AbortError') setError(requestError?.message || 'The search could not be saved. Your message has been restored.')
      } finally {
        advisorAbortRef.current = null
        setSending(false)
      }
      return
    }
    try {
      const pageSurface = {
        ...(companion && workspace?.surface?.hint ? workspace.surface.hint : { surface: 'unsupported' as const }),
        page_path: `${window.location.pathname}${window.location.search}`,
        page_title: pageTitle?.title || document.title,
      }
      const response = await askHubAdvisor(
        org.id,
        requestMessages,
        accessToken,
        contextResources.map((resource) => resource.resource_uuid),
        conversationUuid || undefined,
        submittedResources.map((resource) => resource.resource_uuid),
        pageSurface,
        controller.signal,
      )
      if (!alive.current) return
      const transcriptResources = newHubTranscriptResources(introducedResourceUuidsRef.current, response.resources)
      transcriptResources.forEach((resource) => introducedResourceUuidsRef.current.add(resource.resource_uuid))
      const nextMessages: HubConversationMessage[] = [
        ...previousMessages,
        { id: response.user_message_uuid, role: 'user', content, resources: submittedResources, resourceLabel: submittedResources.length ? 'You added' : undefined, createdAt: response.user_message_created_at, memories: response.memory_changes, page_context: response.page_context },
        { id: response.assistant_message_uuid, role: 'assistant', content: response.answer, resources: transcriptResources, resourceLabel: transcriptResources.length ? 'Suggested' : undefined, createdAt: response.assistant_message_created_at, memories: response.memories_used, page_context: response.page_context, suggestedActions: response.suggested_actions },
      ]
      setMessages(nextMessages)
      setContextResources((current) => addHubContextResources(current, response.resources))
      workspace?.setEditOperations(response.edit_operations || [])
      if (response.edit_run) workspace?.setEditRun(response.edit_run)
      setConversationUuid(response.conversation_uuid)
      setConversationTitle(response.title)
      setConversationInUrl(response.conversation_uuid)
      await refreshHistory()
      if (continuationInFlightRef.current) {
        const completedId = continuationInFlightRef.current
        continuationInFlightRef.current = null
        workspace?.removeEditContinuation(completedId)
      }
    } catch (requestError: any) {
      if (!alive.current) return
      setMessages(previousMessages)
      setPendingResources(submittedResources)
      if (submittedResources.length > 0) setActiveResourceGroupId('pending')
      if (!pendingSubmission?.preserveDraft) setDraft((current) => restoreSubmittedDraft(current, content))
      continuationInFlightRef.current = null
      if (requestError?.name !== 'AbortError') setError(requestError?.message || 'The advisor is temporarily unavailable. Your message has been restored.')
    } finally {
      advisorAbortRef.current = null
      setSending(false)
    }
  }

  useEffect(() => {
    const continuation = workspace?.editContinuations.find((item) => item.conversationUuid === conversationUuid && item.runUuid === workspace.editRun?.run_uuid)
    if (!continuation || !accessToken || !org?.id || !conversationUuid || sending || conversationLoading || attemptedContinuationsRef.current.has(continuation.id)) return
    attemptedContinuationsRef.current.add(continuation.id)
    continuationInFlightRef.current = continuation.id
    pendingSubmissionRef.current = { content: continuation.content, preserveDraft: true, allowHidden: true }
    window.requestAnimationFrame(() => composerRef.current?.form?.requestSubmit())
  }, [accessToken, conversationLoading, conversationUuid, org?.id, sending, workspace?.editContinuations, workspace?.editRun?.run_uuid])

  const activateSuggestedAction = async (messageId: string, action: HubSuggestedAction, mode: 'navigate' | 'edit') => {
    if (!accessToken || !org?.id || !conversationUuid || sending) return
    setError('')
    try {
      const resolved = await resolveHubSuggestedAction(org.id, conversationUuid, messageId, action.action_id, accessToken, mode)
      if (resolved.edit_run) workspace?.setEditRun(resolved.edit_run)
      workspace?.open()
      router.push(getUriWithOrg(orgslug, resolved.route))
      if (mode === 'edit' && resolved.edit_run && !automaticallyStartedRunsRef.current.has(resolved.edit_run.run_uuid)) {
        automaticallyStartedRunsRef.current.add(resolved.edit_run.run_uuid)
        pendingSubmissionRef.current = { content: 'Go ahead and work on this plan.', preserveDraft: true }
        window.requestAnimationFrame(() => composerRef.current?.form?.requestSubmit())
      }
    } catch (actionError: any) {
      setError(actionError?.message || 'That suggested destination is no longer available.')
    }
  }

  const stopEditing = async () => {
    if (!workspace?.editRun || !accessToken || !org?.id) return
    try {
      await concludeHubEditRun(org.id, workspace.editRun.run_uuid, 'cancelled', accessToken)
      workspace.setEditRun(null)
      workspace.setEditOperations([])
      workspace.setEditReviewItems([])
      workspace.clearEditContinuations(workspace.editRun.run_uuid)
    } catch (stopError: any) {
      setError(stopError?.message || 'Editing could not be stopped.')
    }
  }

  const finishEditing = async () => {
    if (!workspace?.editRun || !accessToken || !org?.id) return
    try {
      await concludeHubEditRun(org.id, workspace.editRun.run_uuid, 'completed', accessToken)
      workspace.setEditRun(null)
      workspace.setEditOperations([])
      workspace.setEditReviewItems([])
      workspace.clearEditContinuations(workspace.editRun.run_uuid)
    } catch (finishError: any) {
      setError(finishError?.message || 'This editing goal could not be finished.')
    }
  }

  const pointToEditObject = (targetId: string) => {
    const target = document.getElementById(targetId)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.focus({ preventScroll: true })
    target.classList.remove('hub-object-pointed')
    // Restart the calm outline pulse when the same activity is selected again.
    void target.offsetWidth
    target.classList.add('hub-object-pointed')
    window.setTimeout(() => target.classList.remove('hub-object-pointed'), 1400)
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
    <div className="relative mx-auto min-h-0 w-full max-w-[1056px] flex-1 overflow-hidden" aria-label="Hub conversation">
      {!companion ? <PageTitleRegistration section="Hub" detail={conversationStarted ? conversationTitle : undefined} /> : null}
      <h1 className="sr-only">{conversationTitle || 'Hub'}</h1>
      {(conversationStarted || companion) && (
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
          companion={companion}
          contextUnavailable={companion && !workspace?.surface}
          editRun={workspace?.editRun}
          onStopEditing={() => void stopEditing()}
          onCompanionCollapse={onCompanionCollapse}
          onCompanionExpand={onCompanionExpand}
        />
      )}

      <div ref={scrollRef} className={`scrollbar-subtle absolute inset-x-0 bottom-0 overflow-y-auto overscroll-contain scroll-smooth ${conversationStarted || companion ? (companion && (!workspace?.surface || workspace.editRun?.status === 'active') ? 'top-[4.5rem]' : 'top-11') : 'top-0'}`}>
        <div
          className={`mx-auto min-h-full w-full max-w-3xl px-4 sm:px-6 ${conversationStarted || companion ? 'pt-5' : 'pt-7 sm:pt-10'}`}
          style={{ paddingBottom: composerHeight + 88 + (memoryNoticeVisible ? 148 : 0) + (libraryOpen ? 290 : 0) + (workspace?.editReviewItems.length ? 58 : 0) }}
        >
          <div className="space-y-7" aria-live="polite" aria-busy={sending || conversationLoading}>
            {!conversationUuid && messages.length === 0 && (
              <HubHomeRecents
                conversations={conversations}
                loading={historyLoading}
                disabled={conversationLoading}
                onHistoryOpen={refreshHistory}
                onSelect={openConversation}
                onOpenResources={(uuid) => void openConversation(uuid, true)}
              />
            )}
            {conversationLoading && <div className="py-16 text-center text-sm text-muted-foreground" role="status">Loading conversation…</div>}
              {messages.map((message) => message.role === 'user' ? (
                <div key={message.id} className="group/message space-y-1.5">
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
                    <div className="hub-user-message max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6 text-foreground sm:max-w-[72%]">
                      {message.content}
                    </div>
                  </div>
                  {accessToken && org?.id && <HubMessageMicroBar role="user" content={message.content} createdAt={message.createdAt} memories={message.memories} pageContext={message.page_context} orgId={org.id} accessToken={accessToken} />}
                </div>
              ) : (
                <div key={message.id} className="group/message space-y-1.5">
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
                      {accessToken && org?.id && <HubMessageMicroBar role="assistant" content={`Resource search results for ${message.searchQuery}`} createdAt={message.createdAt} memories={message.memories} pageContext={message.page_context} orgId={org.id} accessToken={accessToken} />}
                    </div>
                  ) : (
                    <>
                      <AssistantResponse content={message.content} />
                      <HubSuggestedActions actions={message.suggestedActions || []} disabled={sending} onActivate={(action, mode) => activateSuggestedAction(message.id, action, mode)} />
                      {accessToken && org?.id && <HubMessageMicroBar role="assistant" content={message.content} createdAt={message.createdAt} memories={message.memories} pageContext={message.page_context} orgId={org.id} accessToken={accessToken} />}
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
              <HubEditActivity run={workspace?.editRun || null} onPoint={pointToEditObject} />
              {workspace?.editOperations.find((operation) => operation.type === 'propose_edit_conclusion') && workspace.editRun?.status === 'active' ? (() => {
                const conclusion = workspace.editOperations.find((operation) => operation.type === 'propose_edit_conclusion')
                return conclusion?.type === 'propose_edit_conclusion' ? <div className="rounded-xl border border-border bg-card p-3 shadow-xs">
                  <p className="text-xs text-muted-foreground">{conclusion.summary}</p>
                  <Button type="button" size="sm" className="mt-3 h-8 text-xs" disabled={Boolean(workspace.editReviewItems.length)} onClick={() => void finishEditing()}>Finish this edit</Button>
                  {workspace.editReviewItems.length ? <p className="mt-2 text-[11px] text-muted-foreground">Save or cancel the remaining {workspace.editReviewItems.length === 1 ? 'object' : `${workspace.editReviewItems.length} objects`} first.</p> : null}
                </div> : null
              })() : null}
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

      <div className="pointer-events-none absolute inset-x-0 bottom-20 z-[var(--z-sticky-header)] lg:bottom-0">
        <div aria-hidden="true" className="hub-composer-backdrop absolute bottom-0 left-0 right-2 -top-10" />
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
        {workspace?.editReviewItems.length ? (
          <div className="hub-edit-review-tray mb-2 flex items-center justify-between gap-3 rounded-xl border border-border bg-background/95 px-3 py-2 shadow-sm backdrop-blur-md" role="status">
            <div className="min-w-0"><p className="truncate text-xs font-semibold">Ready to review</p><p className="truncate text-[11px] text-muted-foreground">{workspace.editReviewItems.length === 1 ? workspace.editReviewItems[0].label : `${workspace.editReviewItems.length} objects changed`}</p></div>
            <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={() => pointToEditObject(workspace.editReviewItems[0].targetId)}>Review <ArrowRight size={12} /></Button>
          </div>
        ) : null}
        <form onSubmit={submit} className="flex flex-col justify-end">
          <div className="hub-composer-shell rounded-[1.6rem] p-2 backdrop-blur-md">
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
                disabled={conversationLoading}
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
                className={`hub-composer-fade pointer-events-none absolute inset-x-0 bottom-0 h-7 transition-opacity ${composerFades.bottom ? 'opacity-100' : 'opacity-0'}`}
              />
            </div>
            <div className="flex h-9 items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <Button type="button" size="icon" variant={libraryOpen ? 'secondary' : 'ghost'} className="h-8 w-8 text-muted-foreground" onClick={() => setLibraryOpen((current) => !current)} disabled={!accessToken || !org?.id} title="Add resources from your Library" aria-label="Add resource context" aria-expanded={libraryOpen}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Button
                type={sending ? 'button' : 'submit'}
                size="icon"
                className="h-8 w-8"
                disabled={sending ? false : !draft.trim() || conversationLoading || !accessToken}
                aria-label={sending ? 'Stop response' : 'Send message'}
                onClick={sending ? () => advisorAbortRef.current?.abort() : undefined}
              >
                {sending ? <Square className="h-3.5 w-3.5 fill-current" /> : <Send className="h-4 w-4" />}
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
    </div>
  )
}
