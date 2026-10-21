'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { concludeHubEditRun, reopenHubEditRun, updateHubEditRunGoal } from '@services/hub/advisor'
import { getUriWithOrg } from '@services/config/config'
import type { HubContextValue } from '../HubContext'
import { mergePendingHubEditOperations, recoverHubEditOperations, sessionEventLabel } from './editRunTimeline'
import { continuationId } from '@components/Goals/edit/useGoalProposals'

type Message = { id: string; role: string; content: string }

/** Focused editing sessions: ending, finishing, restoring, retargeting, and pointing at what changed. */
// eslint-disable-next-line no-unused-vars
export default function useHubEditRun({ hub, orgslug, orgId, accessToken, messages, onError }: { hub: HubContextValue | null; orgslug: string; orgId?: number; accessToken?: string; messages: Message[]; onError: (message: string) => void }) {
  const router = useRouter()
  const run = hub?.editRun || null

  useEffect(() => {
    if (!run || !hub) return
    hub.setEditOperations((current) => mergePendingHubEditOperations(current, recoverHubEditOperations(run), run))
  }, [run, hub?.setEditOperations]) // eslint-disable-line react-hooks/exhaustive-deps

  const narratedConclusionMessageId = useMemo(() => {
    if (run?.status !== 'active' || run.objects.some((item) => item.status === 'editing') || run.events.some((event) => event.kind === 'run.conclusion_proposed')) return ''
    const last = messages.at(-1)
    if (last?.role !== 'assistant') return ''
    return /(?:finish|close|end).{0,50}(?:edit|editing|session|run)|(?:edit|editing|session|run).{0,50}(?:finish|close|end)/i.test(last.content) ? last.id : ''
  }, [messages, run])

  const restoreOfferMessageId = useMemo(() => {
    if (!run || run.status === 'active') return ''
    const assistant = messages.at(-1)
    const learner = [...messages].reverse().find((message) => message.role === 'user' && !sessionEventLabel(message.content))
    if (assistant?.role !== 'assistant' || !learner) return ''
    const asksForWork = /\b(add|edit|change|update|continue|resume|reopen|work on|help with)\b/i.test(learner.content)
    const namesScope = /\b(plan|phase|objective|timeline|session|it|that)\b/i.test(learner.content)
    return asksForWork && namesScope ? assistant.id : ''
  }, [messages, run])

  const conclude = async (status: 'cancelled' | 'completed') => {
    if (!run || !hub || !accessToken || !orgId) return
    try {
      const ended = await concludeHubEditRun(orgId, run.run_uuid, status, accessToken)
      hub.setEditRun(ended)
      hub.setEditOperations([])
      hub.setEditReviewItems([])
      hub.clearEditContinuations(run.run_uuid)
    } catch (error: any) {
      onError(error?.message || (status === 'cancelled' ? 'Editing could not be stopped.' : 'This editing goal could not be finished.'))
    }
  }

  const restore = async () => {
    if (!run || !hub || !accessToken || !orgId || run.status === 'active') return
    try {
      const restored = await reopenHubEditRun(orgId, run.run_uuid, accessToken)
      hub.setEditRun(restored)
      hub.setEditOperations(recoverHubEditOperations(restored))
      hub.open()
      router.push(getUriWithOrg(orgslug, restored.scope.route))
      hub.enqueueEditContinuation({
        id: continuationId(), conversationUuid: restored.conversation_uuid, runUuid: restored.run_uuid,
        content: `[[hub-session-event]] You reopened the focused session\nThe learner restored the focused session “${restored.goal}”. Briefly assess its saved and unresolved state, then ask one short question about how they would like to continue. Do not make new edits before their answer.`,
      })
    } catch (error: any) {
      onError(error?.message || 'This focused session could not be restored.')
    }
  }

  const updateGoal = async (goal: string) => {
    if (!run || !hub || !accessToken || !orgId) return
    try {
      const updated = await updateHubEditRunGoal(orgId, run.run_uuid, goal, accessToken)
      hub.setEditRun(updated)
      hub.enqueueEditContinuation({
        id: continuationId(), conversationUuid: updated.conversation_uuid, runUuid: updated.run_uuid,
        content: `[[hub-session-event]] You updated the session goal\nThe focused-session goal is now: ${updated.goal}. Continue within the existing scope.`,
      })
    } catch (error: any) {
      onError(error?.message || 'The session goal could not be updated.')
      throw error
    }
  }

  /** Brings an object Coach changed into view on the page, with a brief highlight. */
  const pointTo = (targetId: string) => {
    const target = document.getElementById(targetId)
    if (!target) return
    // On phones the page is pulled aside while Coach is open; bring it back to show the change.
    if (window.matchMedia('(max-width: 767px)').matches) hub?.tuck()
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.focus({ preventScroll: true })
    target.classList.remove('hub-object-pointed')
    void target.offsetWidth
    target.classList.add('hub-object-pointed')
    window.setTimeout(() => target.classList.remove('hub-object-pointed'), 1400)
  }

  return {
    narratedConclusionMessageId, restoreOfferMessageId,
    stop: () => conclude('cancelled'), finish: () => conclude('completed'), restore, updateGoal, pointTo,
  }
}
