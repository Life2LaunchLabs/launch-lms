'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { useHub, type HubCoachIntent } from '@components/Hub/HubContext'
import { usePageTitle } from '@components/Contexts/PageTitleContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import {
  archiveHubConversation, askHubAdvisor, getActiveHubEditRun, getHubConversation, HubAdvisorMessage, HubAdvisorResource,
  HubConversationSummary, HubSuggestedAction, listHubConversations, recordHubSearch, renameHubConversation,
  resolveHubSuggestedAction, saveHubConversationState,
} from '@services/hub/advisor'
import { getResource, Resource } from '@services/resources/resources'
import { getUriWithOrg } from '@services/config/config'
import HubHeader from './HubHeader'
import HubComposer, { COMPOSER_MIN_HEIGHT, type HubComposerHandle } from './HubComposer'
import HubThread, { type HubConversationMessage } from './HubThread'
import HubHome from '../home/HubHome'
import HubResourceTray from '../resources/HubResourceTray'
import { asAdvisorResource } from '../resources/HubResourceContext'
import { addHubContextResource, addHubContextResources, hubAdvisorHistory, inferHubResponseKind, newHubTranscriptResources, removeHubContextResource, restoreSubmittedDraft } from '@services/hub/interaction'
import { buildHubRunTimeline, mergePendingHubEditOperations, placeHubRunTimeline, recoverHubEditOperations } from './editRunTimeline'
import useHubMemory from './useHubMemory'
import useHubEditRun from './useHubEditRun'

function advisorErrorMessage(error: any) {
  if (error?.status === 422) return 'I couldn’t send that turn. Please try again—your message is still here.'
  return error?.message || 'The advisor is temporarily unavailable. Your message has been restored.'
}

type HubConversationProps = {
  orgslug: string
  /** True while the coach is out; sending is only allowed then (continuations aside). */
  active: boolean
  intent: (HubCoachIntent & { id: number }) | null
  onIntentConsumed: () => void
  /** Increments when the learner ends the conversation from outside the coach. */
  endSignal: number
  /* eslint-disable no-unused-vars */
  onStartedChange: (started: boolean) => void
  /* eslint-enable no-unused-vars */
  onReply: () => void
}

/** One conversation with Hub, next to whatever page the learner is on. */
export default function HubConversation({ orgslug, active, intent, onIntentConsumed, endSignal, onStartedChange, onReply }: HubConversationProps) {
  const router = useRouter()
  const hub = useHub()
  const pageTitle = usePageTitle()
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const storageKey = `launchlms:hub-thread:${org?.id}:${session?.data?.user?.id}`
  const alive = useRef(true)
  const loadSequence = useRef(0)
  useEffect(() => { alive.current = true; return () => { alive.current = false; loadSequence.current += 1 } }, [])
  const [messages, setMessages] = useState<HubConversationMessage[]>([])
  const [conversationUuid, setConversationUuid] = useState<string | null>(null)
  const [conversationTitle, setConversationTitle] = useState('')
  const [conversations, setConversations] = useState<HubConversationSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [conversationLoading, setConversationLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [contextResources, setContextResources] = useState<HubAdvisorResource[]>([])
  const [pendingResources, setPendingResources] = useState<HubAdvisorResource[]>([])
  const [trayUuid, setTrayUuid] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [composerHeight, setComposerHeight] = useState(COMPOSER_MIN_HEIGHT)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HubComposerHandle>(null)
  const messageSequenceRef = useRef(0)
  const introducedResourceUuidsRef = useRef(new Set<string>())
  const stateSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const advisorAbortRef = useRef<AbortController | null>(null)
  const pendingSubmissionRef = useRef<{ content: string; preserveDraft: boolean; allowHidden?: boolean } | null>(null)
  const continuationInFlightRef = useRef<string | null>(null)
  const attemptedContinuationsRef = useRef(new Set<string>())
  const automaticallyStartedRunsRef = useRef(new Set<string>())
  const restoredRef = useRef(false)
  const conversationStarted = Boolean(conversationUuid || messages.length > 0)
  const inChat = useMemo(() => new Set(contextResources.map((resource) => resource.resource_uuid)), [contextResources])
  const timelineSlots = useMemo(() => placeHubRunTimeline(buildHubRunTimeline(hub?.editRun?.events || []), messages), [messages, hub?.editRun?.events])
  const reportError = useCallback((message: string) => setError(message), [])
  const memory = useHubMemory(org?.id, accessToken, reportError)
  const editing = useHubEditRun({ hub, orgslug, orgId: org?.id, accessToken, messages, onError: reportError })

  useEffect(() => { onStartedChange(conversationStarted) }, [conversationStarted, onStartedChange])

  const rememberConversation = (uuid: string | null) => {
    if (!alive.current) return
    try { if (uuid) sessionStorage.setItem(storageKey, uuid); else sessionStorage.removeItem(storageKey) } catch { /* storage is optional */ }
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

  useEffect(() => { if (!conversationUuid) void refreshHistory() }, [conversationUuid, refreshHistory])

  const openConversation = async (uuid: string, openResources = false) => {
    if (!accessToken || !org?.id || sending) return
    const load = ++loadSequence.current
    setConversationLoading(true)
    setError('')
    try {
      const conversation = await getHubConversation(org.id, uuid, accessToken)
      if (!alive.current || load !== loadSequence.current) return
      const restored = conversation.messages.map((message) => ({
        id: message.id, role: message.role, content: message.content, resources: message.resources, resourceLabel: message.resource_label,
        searchQuery: message.search_query, createdAt: message.created_at, memories: message.memories, page_context: message.page_context, suggestedActions: message.suggested_actions,
      }))
      setMessages(restored)
      setConversationUuid(conversation.conversation_uuid)
      setConversationTitle(conversation.title)
      setContextResources(conversation.context_resources)
      setPendingResources([])
      setTrayUuid(openResources ? conversation.context_resources.at(-1)?.resource_uuid ?? null : null)
      introducedResourceUuidsRef.current = new Set(restored.flatMap((message) => (message.resources || []).map((resource) => resource.resource_uuid)))
      rememberConversation(conversation.conversation_uuid)
      getActiveHubEditRun(org.id, uuid, accessToken)
        .then((result) => {
          if (!alive.current || load !== loadSequence.current) return
          hub?.setEditRun(result.edit_run)
          hub?.setEditOperations(recoverHubEditOperations(result.edit_run))
        })
        .catch(() => { if (alive.current && load === loadSequence.current) hub?.setEditRun(null) })
    } catch (loadError: any) {
      if (!alive.current || load !== loadSequence.current) return
      setError(loadError?.message || 'This conversation could not be opened.')
      if (loadError?.status === 404) rememberConversation(null)
    } finally {
      if (alive.current && load === loadSequence.current) setConversationLoading(false)
    }
  }

  // Pick the session's conversation back up after navigation or a reload.
  useEffect(() => {
    if (restoredRef.current || !accessToken || !org?.id) return
    restoredRef.current = true
    if (intent?.conversation) return
    try {
      const uuid = sessionStorage.getItem(storageKey)
      if (uuid) void openConversation(uuid)
    } catch { /* history remains available without session storage */ }
  }, [accessToken, org?.id, storageKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const persistState = (nextMessages: HubConversationMessage[], nextContext: HubAdvisorResource[]) => {
    if (!conversationUuid || !accessToken || !org?.id) return
    const uuid = conversationUuid
    const state = {
      context_resource_uuids: nextContext.map((resource) => resource.resource_uuid),
      message_resources: nextMessages.filter((message) => message.id.startsWith('hub_message_')).map((message) => ({
        message_uuid: message.id, resource_uuids: (message.resources || []).map((resource) => resource.resource_uuid), label: message.resourceLabel,
      })),
    }
    stateSaveQueueRef.current = stateSaveQueueRef.current.catch(() => undefined)
      .then(() => saveHubConversationState(org.id, uuid, accessToken, state))
      .catch((stateError: any) => setError(stateError?.message || 'Conversation changes could not be saved.'))
  }

  const addResource = (resource: Resource) => {
    const advisorResource = asAdvisorResource(resource)
    introducedResourceUuidsRef.current.add(resource.resource_uuid)
    const nextContext = addHubContextResource(contextResources, advisorResource)
    setContextResources(nextContext)
    setPendingResources((current) => addHubContextResource(current, advisorResource))
    setLibraryOpen(false)
    persistState(messages, nextContext)
  }

  // Work handed to the coach from the page: a message to send, a thread to resume, a resource to talk about.
  useEffect(() => {
    if (!intent || !accessToken || !org?.id || !memory.loaded) return
    onIntentConsumed()
    if (intent.conversation && intent.conversation !== conversationUuid) void openConversation(intent.conversation)
    if (intent.resource) {
      const uuid = intent.resource.startsWith('resource_') ? intent.resource : `resource_${intent.resource}`
      getResource(uuid, accessToken).then(addResource).catch((loadError: any) => setError(loadError?.message || 'This resource is not available.'))
    }
    if (intent.prompt?.trim()) {
      pendingSubmissionRef.current = { content: intent.prompt, preserveDraft: true, allowHidden: true }
      window.requestAnimationFrame(() => composerRef.current?.submit())
    } else window.requestAnimationFrame(() => composerRef.current?.focus())
  }, [intent, accessToken, org?.id, memory.loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const area = scrollRef.current
    if (area) area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, pendingResources, libraryOpen])

  const resetChat = () => {
    setMessages([]); setConversationUuid(null); setConversationTitle(''); setContextResources([]); setPendingResources([]); setTrayUuid(null)
    introducedResourceUuidsRef.current.clear()
    setDraft(''); setError('')
    rememberConversation(null)
    hub?.setEditRun(null); hub?.setEditOperations([]); hub?.setEditReviewItems([]); hub?.clearEditContinuations(hub.editRun?.run_uuid)
  }

  const endSeen = useRef(endSignal)
  useEffect(() => { if (endSignal !== endSeen.current) { endSeen.current = endSignal; resetChat() } }, [endSignal]) // eslint-disable-line react-hooks/exhaustive-deps

  const inspectSearchResource = (groupId: string, resource: Resource) => {
    const advisorResource = asAdvisorResource(resource)
    introducedResourceUuidsRef.current.add(resource.resource_uuid)
    const nextContext = addHubContextResource(contextResources, advisorResource)
    const nextMessages = messages.map((message) => message.id === groupId ? { ...message, resources: addHubContextResource(message.resources || [], advisorResource) } : message)
    setContextResources(nextContext); setMessages(nextMessages); setTrayUuid(resource.resource_uuid)
    persistState(nextMessages, nextContext)
  }

  const openTrayAt = (resource: HubAdvisorResource) => {
    if (!inChat.has(resource.resource_uuid)) {
      const nextContext = addHubContextResource(contextResources, resource)
      setContextResources(nextContext)
      persistState(messages, nextContext)
      toast.success('Added back to this chat')
    }
    setTrayUuid(resource.resource_uuid)
  }

  const removeFromChat = (resource: HubAdvisorResource) => {
    const previous = contextResources
    const { resources: nextContext, nextActiveUuid } = removeHubContextResource(previous, resource.resource_uuid)
    setContextResources(nextContext)
    setPendingResources((current) => current.filter((item) => item.resource_uuid !== resource.resource_uuid))
    setTrayUuid(nextActiveUuid)
    persistState(messages, nextContext)
    toast((item) => <span className="flex items-center gap-3 text-sm">Removed from this chat<button type="button" className="font-semibold underline underline-offset-4" onClick={() => { toast.dismiss(item.id); setContextResources(previous); setMessages((current) => { persistState(current, previous); return current }) }}>Undo</button></span>, { duration: 5000 })
  }

  const pageSurface = () => ({
    ...(hub?.surface?.hint || { surface: 'unsupported' as const }),
    page_path: `${window.location.pathname}${window.location.search}`,
    page_title: pageTitle?.title || document.title,
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const pending = pendingSubmissionRef.current
    pendingSubmissionRef.current = null
    const content = (pending?.content || draft).trim()
    if (!content || !accessToken || !org?.id || sending || conversationLoading || (!active && !pending?.allowHidden)) return
    const previousMessages = messages
    let history: HubAdvisorMessage[] = hubAdvisorHistory(messages)
    while (history.length >= 2 && history.reduce((sum, item) => sum + item.content.length, 0) + content.length > 7_500) history = history.slice(2)
    if (!conversationUuid) {
      const normalized = content.replace(/\s+/g, ' ').trim()
      setConversationTitle(normalized.length <= 80 ? normalized : `${normalized.slice(0, 77).trimEnd()}…`)
    }
    messageSequenceRef.current += 1
    const submittedResources = pendingResources
    const userMessage = (id: string, createdAt?: string, extra: Partial<HubConversationMessage> = {}): HubConversationMessage => ({ id, role: 'user', content, resources: submittedResources, resourceLabel: submittedResources.length ? 'You added' : undefined, createdAt, ...extra })
    setMessages((current) => [...current, userMessage(`user-${messageSequenceRef.current}`)])
    setPendingResources([])
    if (!pending?.preserveDraft) setDraft('')
    setError('')
    setSending(true)
    const controller = new AbortController()
    advisorAbortRef.current = controller
    const restore = () => {
      setMessages(previousMessages)
      setPendingResources(submittedResources)
      if (!pending?.preserveDraft) setDraft((current) => restoreSubmittedDraft(current, content))
    }
    try {
      if (inferHubResponseKind(content) === 'search') {
        const persisted = await recordHubSearch(org.id, content, accessToken, {
          conversationUuid: conversationUuid || undefined, resourceUuids: contextResources.map((resource) => resource.resource_uuid),
          learnerResourceUuids: submittedResources.map((resource) => resource.resource_uuid), surface: pageSurface(), signal: controller.signal,
        })
        if (!alive.current) return
        setMessages([...previousMessages,
          userMessage(persisted.user_message_uuid, persisted.user_message_created_at, { page_context: persisted.page_context }),
          { id: persisted.assistant_message_uuid, role: 'assistant', content: '', searchQuery: content, createdAt: persisted.assistant_message_created_at, page_context: persisted.page_context },
        ])
        setConversationUuid(persisted.conversation_uuid); setConversationTitle(persisted.title); rememberConversation(persisted.conversation_uuid)
      } else {
        const response = await askHubAdvisor(org.id, [...history, { role: 'user', content }], accessToken, contextResources.map((resource) => resource.resource_uuid), conversationUuid || undefined, submittedResources.map((resource) => resource.resource_uuid), pageSurface(), controller.signal)
        if (!alive.current) return
        const transcriptResources = newHubTranscriptResources(introducedResourceUuidsRef.current, response.resources)
        transcriptResources.forEach((resource) => introducedResourceUuidsRef.current.add(resource.resource_uuid))
        setMessages([...previousMessages,
          userMessage(response.user_message_uuid, response.user_message_created_at, { memories: response.memory_changes, page_context: response.page_context }),
          { id: response.assistant_message_uuid, role: 'assistant', content: response.answer, resources: transcriptResources, resourceLabel: transcriptResources.length ? 'Suggested' : undefined, createdAt: response.assistant_message_created_at, memories: response.memories_used, page_context: response.page_context, suggestedActions: response.suggested_actions },
        ])
        setContextResources((current) => addHubContextResources(current, response.resources))
        hub?.setEditOperations((current) => mergePendingHubEditOperations(current, response.edit_operations || [], response.edit_run || hub.editRun))
        if (response.edit_run) hub?.setEditRun(response.edit_run)
        setConversationUuid(response.conversation_uuid); setConversationTitle(response.title); rememberConversation(response.conversation_uuid)
        if (continuationInFlightRef.current) {
          hub?.removeEditContinuation(continuationInFlightRef.current)
          continuationInFlightRef.current = null
        }
      }
      onReply()
      await refreshHistory()
    } catch (requestError: any) {
      if (!alive.current) return
      restore()
      continuationInFlightRef.current = null
      if (requestError?.name !== 'AbortError') setError(inferHubResponseKind(content) === 'search' ? requestError?.message || 'The search could not be saved. Your message has been restored.' : advisorErrorMessage(requestError))
    } finally {
      advisorAbortRef.current = null
      setSending(false)
    }
  }

  // Events from the page (saving or cancelling Hub's proposals) continue the editing session.
  useEffect(() => {
    const continuation = hub?.editContinuations.find((item) => item.conversationUuid === conversationUuid && item.runUuid === hub.editRun?.run_uuid)
    if (!continuation || !accessToken || !org?.id || !conversationUuid || sending || conversationLoading || attemptedContinuationsRef.current.has(continuation.id)) return
    attemptedContinuationsRef.current.add(continuation.id)
    continuationInFlightRef.current = continuation.id
    pendingSubmissionRef.current = { content: continuation.content, preserveDraft: true, allowHidden: true }
    window.requestAnimationFrame(() => composerRef.current?.submit())
  }, [accessToken, conversationLoading, conversationUuid, org?.id, sending, hub?.editContinuations, hub?.editRun?.run_uuid])

  const activateSuggestedAction = async (messageId: string, action: HubSuggestedAction, mode: 'navigate' | 'edit') => {
    if (!accessToken || !org?.id || !conversationUuid || sending) return
    setError('')
    try {
      const resolved = await resolveHubSuggestedAction(org.id, conversationUuid, messageId, action.action_id, accessToken, mode)
      if (resolved.edit_run) hub?.setEditRun(resolved.edit_run)
      router.push(getUriWithOrg(orgslug, resolved.route))
      if (mode === 'edit' && resolved.edit_run && !automaticallyStartedRunsRef.current.has(resolved.edit_run.run_uuid)) {
        automaticallyStartedRunsRef.current.add(resolved.edit_run.run_uuid)
        pendingSubmissionRef.current = { content: 'Go ahead and work on this plan.', preserveDraft: true }
        window.requestAnimationFrame(() => composerRef.current?.submit())
      } else if (window.matchMedia('(max-width: 767px)').matches) hub?.tuck()
    } catch (actionError: any) {
      setError(actionError?.message || 'That suggested destination is no longer available.')
    }
  }

  const renameConversation = async (uuid: string, title: string) => {
    if (!accessToken || !org?.id) return
    try {
      const updated = await renameHubConversation(org.id, uuid, title, accessToken)
      setConversations((current) => current.map((item) => item.conversation_uuid === uuid ? { ...item, title: updated.title, updated_at: new Date().toISOString() } : item))
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

  const busy = sending || conversationLoading
  return <div className="relative h-full min-h-0 w-full overflow-hidden" aria-label="Hub conversation">
    <h1 className="sr-only">{conversationTitle || 'Hub'}</h1>
    <HubHeader
      conversationUuid={conversationUuid} conversationStarted={conversationStarted} title={conversationTitle} conversations={conversations}
      loading={historyLoading} disabled={busy} onHistoryOpen={refreshHistory} onNew={resetChat} onSelect={openConversation}
      onOpenResources={(uuid) => void openConversation(uuid, true)}
      onRename={(title) => conversationUuid ? renameConversation(conversationUuid, title) : Promise.resolve()}
      onArchive={archiveConversation} contextUnavailable={!hub?.surface} editRun={hub?.editRun}
      onStopEditing={() => void editing.stop()} onUpdateEditGoal={editing.updateGoal}
      onTuck={() => hub?.tuck()} onEnd={() => hub?.end()}
    />
    <div ref={scrollRef} className={`scrollbar-subtle absolute inset-x-0 bottom-0 overflow-y-auto overscroll-contain scroll-smooth ${hub?.editRun?.status === 'active' ? 'top-[5.25rem]' : !hub?.surface ? 'top-[5rem]' : 'top-14'}`}>
      <div className="min-h-full w-full px-3 pt-4 sm:px-4" style={{ paddingBottom: composerHeight + 88 + (memory.visible ? 148 : 0) + (libraryOpen ? 290 : 0) + (hub?.editReviewItems.length ? 58 : 0) }}>
        <div className="space-y-6" aria-live="polite" aria-busy={busy}>
          {!conversationUuid && messages.length === 0 ? <HubHome orgslug={orgslug} token={accessToken} disabled={busy} conversations={conversations} historyLoading={historyLoading} onHistoryOpen={refreshHistory} onSelect={openConversation} onOpenResources={(uuid) => void openConversation(uuid, true)} onPick={(content) => { pendingSubmissionRef.current = { content, preserveDraft: true }; composerRef.current?.submit() }} /> : null}
          {conversationLoading ? <div className="py-16 text-center text-sm text-muted-foreground" role="status">Loading conversation…</div> : null}
          <HubThread
            messages={messages} timelineSlots={timelineSlots} editRun={hub?.editRun || null} editObjects={hub?.editRun?.objects || []}
            pendingReviewCount={hub?.editReviewItems.length || 0} pendingResources={pendingResources} inChat={inChat}
            orgId={org?.id} orgUuid={org?.org_uuid} accessToken={accessToken} sending={sending}
            narratedConclusionMessageId={editing.narratedConclusionMessageId} restoreOfferMessageId={editing.restoreOfferMessageId}
            onOpenResource={openTrayAt} onInspectSearchResource={inspectSearchResource} onActivateAction={activateSuggestedAction}
            onPoint={editing.pointTo} onFinish={() => void editing.finish()} onRestore={() => void editing.restore()}
          />
          {sending ? <div className="text-sm text-muted-foreground" role="status">Thinking…</div> : null}
          {error ? <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div> : null}
        </div>
      </div>
    </div>
    <HubComposer
      ref={composerRef} orgslug={orgslug} orgId={org?.id} accessToken={accessToken} draft={draft} setDraft={setDraft} onSubmit={submit}
      onStop={() => advisorAbortRef.current?.abort()} sending={sending} loading={conversationLoading} onHeightChange={setComposerHeight}
      memory={memory} reviewItems={hub?.editReviewItems || []} onReview={editing.pointTo} conversationStarted={conversationStarted}
      contextResources={contextResources} onOpenTray={() => setTrayUuid(contextResources.at(-1)?.resource_uuid ?? null)}
      libraryOpen={libraryOpen} setLibraryOpen={setLibraryOpen} onAddResource={addResource}
      onBrowse={() => { router.push(getUriWithOrg(orgslug, '/discover?type=resources')); if (window.matchMedia('(max-width: 767px)').matches) hub?.tuck() }}
    />
    {trayUuid ? <HubResourceTray resources={contextResources} activeUuid={trayUuid} orgslug={orgslug} onActiveChange={setTrayUuid} onRemove={removeFromChat} onClose={() => setTrayUuid(null)} /> : null}
  </div>
}
