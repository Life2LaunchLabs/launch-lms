'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { ActivityPlayer, type ActivityRuntime, getActivityResult } from '@components/Learning/player/ActivityPlayer'
import { completeLearningPage, submitLearningResponse } from '@services/learning/learning'
import { goalActivityApi } from '@services/goals/activity'
import { isGoalsKey } from '@services/goals/goals'
import { getUriWithOrg } from '@services/config/config'

/** Plays an activity step; finishing it completes the step and returns to the goal. */
export default function GoalActivityPlayer({ orgslug, goalUuid, stepUuid, activity, initialRun }: { orgslug: string; goalUuid: string; stepUuid: string; activity: any; initialRun: any }) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const runUuidRef = React.useRef<string | undefined>(initialRun?.run_uuid)
  const [retakeBaselineAttemptIds] = React.useState<Set<string>>(() => {
    const isRetake = getActivityResult(initialRun)?.status === 'failed'
    return new Set(isRetake ? (initialRun?.attempts || []).map((attempt: any) => attempt.attempt_uuid) : [])
  })
  const goalHref = getUriWithOrg(orgslug, `/plans/${encodeURIComponent(goalUuid)}`)

  const runtime = React.useMemo<ActivityRuntime>(() => ({
    start: async () => {
      const started = await goalActivityApi.start(goalUuid, stepUuid, accessToken)
      runUuidRef.current = started?.run?.run_uuid
      return started?.run
    },
    submit: (pageUuid, answer, button) => submitLearningResponse(runUuidRef.current || '', pageUuid, answer, accessToken, button),
    complete: (pageUuid, button) => completeLearningPage(runUuidRef.current || '', pageUuid, button ? { button } : {}, accessToken),
  }), [goalUuid, stepUuid, accessToken])

  const finish = (run: any) => {
    const grading = activity.settings?.grading || {}
    const result = getActivityResult(run)
    // An activity with an ending screen has already told them how it went.
    if (activity.settings?.design?.ending) { /* nothing more to say */ }
    else if (result?.status === 'pending') toast.success('Activity submitted for review.')
    else if (result?.status === 'failed') toast.error(grading.failure_message || 'Activity finished. Review your answers and try again when you are ready.')
    else toast.success(grading.success_message || 'Step done. Nice work.')
    void mutate((key) => isGoalsKey(key))
    router.replace(goalHref)
    router.refresh()
  }

  return <ActivityPlayer
    activity={activity}
    initialRun={initialRun}
    runtime={runtime}
    retakeBaselineAttemptIds={retakeBaselineAttemptIds}
    onClose={() => router.push(goalHref)}
    onFinish={finish}
    responseMediaOwner={{ type: 'user', id: Number(session?.data?.user?.id) }}
  />
}
