'use client'

import toast from 'react-hot-toast'
import { useHub } from '@components/Hub/HubContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { recoverHubEditOperations } from '@components/Hub/conversation/editRunTimeline'
import { concludeHubEditRun, startGoalCoachSession } from '@services/hub/advisor'
import type { Goal } from '@services/goals/types'
import { continuationId, useGoalSession } from './useGoalProposals'

/**
 * Coach's session on one goal, started by the learner from the goal page. Starting opens Coach
 * in the session's conversation and asks it to begin; an existing session is picked back up.
 */
export default function useGoalCoachSession(goal: Pick<Goal, 'goal_uuid' | 'title'>, token?: string) {
  const hub = useHub()
  const org = useOrg() as { id?: number } | null
  const session = useGoalSession(goal.goal_uuid)

  /** ``ask`` is what the learner wants first, such as steps for one stage. */
  const start = async (ask?: string) => {
    if (!hub || !org?.id || !token) return
    try {
      const run = await startGoalCoachSession(org.id, goal.goal_uuid, token)
      hub.setEditRun(run)
      hub.setEditOperations(recoverHubEditOperations(run))
      hub.open({ conversation: run.conversation_uuid })
      const fresh = run.events.length <= 1
      if (fresh || ask) hub.enqueueEditContinuation({
        id: continuationId(), conversationUuid: run.conversation_uuid, runUuid: run.run_uuid,
        content: `[[hub-session-event]] You asked Coach to plan this goal with you\n${ask || `Look over my goal “${goal.title}” and suggest what would help most next. Keep it small; I'll keep what fits.`}`,
      })
    } catch (error: any) {
      toast.error(error?.message || 'Coach couldn’t start a session on this goal.')
    }
  }

  /** Ends the session; anything Coach suggested stays on the goal as suggestions. */
  const end = async () => {
    if (!hub || !org?.id || !token || !session) return
    try {
      const ended = await concludeHubEditRun(org.id, session.run_uuid, 'cancelled', token)
      hub.setEditRun(ended)
      hub.setEditOperations([])
      hub.clearEditContinuations(session.run_uuid)
    } catch (error: any) {
      toast.error(error?.message || 'Coach’s session could not be ended.')
      throw error
    }
  }

  return { session, start, end, available: Boolean(hub && org?.id && token) }
}
