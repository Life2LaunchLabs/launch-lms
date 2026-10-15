'use client'

import React from 'react'
import { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { goalsApi, goalUrl, isGoalsKey } from '@services/goals/goals'
import type { Goal, Step } from '@services/goals/types'
import type { StepActions } from './steps'

/**
 * Calls the goal API for one goal and keeps every view of it current: each change returns
 * the whole goal, which replaces the cached goal at once, and the rest of /goals revalidates.
 */
export function useGoalMutation(goalUuid: string, token?: string) {
  const { mutate } = useSWRConfig()
  const [busy, setBusy] = React.useState(false)
  const run = React.useCallback(async (change: () => Promise<Goal | unknown>, done?: string) => {
    setBusy(true)
    try {
      const result = await change()
      if (result && typeof result === 'object' && 'goal_uuid' in result && 'stages' in result) await mutate(goalUrl(goalUuid), result, { revalidate: false })
      await mutate((key) => isGoalsKey(key) && key !== goalUrl(goalUuid))
      if (done) toast.success(done)
      return result
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t work. Try again.')
      throw error
    } finally {
      setBusy(false)
    }
  }, [goalUuid, mutate])
  return { busy, run }
}

/** A step card's actions, bound to its goal and step. */
export function useStepActions(goal: Goal, step: Step, token: string | undefined, openActivity: () => void): StepActions {
  const { busy, run } = useGoalMutation(goal.goal_uuid, token)
  const g = goal.goal_uuid
  const s = step.step_uuid
  const quiet = <T,>(promise: () => Promise<T>) => run(promise).then(() => undefined, () => undefined)
  return {
    busy,
    setStatus: (status, note) => quiet(() => goalsApi.setStatus(g, s, status, note, token)),
    saveSubmission: (data) => quiet(() => goalsApi.saveSubmission(g, s, data, token)),
    addEntry: (data) => quiet(() => goalsApi.addEntry(g, s, data, token)),
    updateEntry: (entryUuid, data) => quiet(() => goalsApi.updateEntry(g, s, entryUuid, data, token)),
    deleteEntry: (entryUuid) => quiet(() => goalsApi.deleteEntry(g, s, entryUuid, token)),
    openActivity,
  }
}
