'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { ActivityPlayer, type ActivityRuntime, getActivityResult } from '@components/Learning/player/ActivityPlayer'
import { completeLearningPage, submitLearningResponse } from '@services/learning/learning'
import { planningApi } from '@services/planning/planning'
import { getUriWithOrg } from '@services/config/config'

/** Plays a plan step's activity; finishing it completes the step and returns to the plan. */
export default function PlanActivityPlayer({ orgslug, planSlug, objectiveUuid, activity, initialRun }: { orgslug: string; planSlug: string; objectiveUuid: string; activity: any; initialRun: any }) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const runUuidRef = React.useRef<string | undefined>(initialRun?.run_uuid)
  const [retakeBaselineAttemptIds] = React.useState<Set<string>>(() => {
    const isRetake = getActivityResult(initialRun, activity)?.status === 'failed'
    return new Set(isRetake ? (initialRun?.attempts || []).map((attempt: any) => attempt.attempt_uuid) : [])
  })
  const planHref = getUriWithOrg(orgslug, `/plans/${encodeURIComponent(planSlug)}`)

  const runtime = React.useMemo<ActivityRuntime>(() => ({
    start: async () => {
      const started = await planningApi.startObjectiveActivity(planSlug, objectiveUuid, accessToken)
      runUuidRef.current = started?.run?.run_uuid
      return started?.run
    },
    submit: (pageUuid, answer, button) => submitLearningResponse(runUuidRef.current || '', pageUuid, answer, accessToken, button),
    complete: (pageUuid, button) => completeLearningPage(runUuidRef.current || '', pageUuid, button ? { button } : {}, accessToken),
  }), [planSlug, objectiveUuid, accessToken])

  const finish = (run: any) => {
    const grading = activity.settings?.grading || {}
    const result = getActivityResult(run, activity)
    if (result?.status === 'pending') toast.success('Activity submitted for review.')
    else if (result?.status === 'failed') toast.error(grading.failure_message || 'Activity finished. Review your answers and try again when you are ready.')
    else toast.success(grading.success_message || 'Step done. Nice work.')
    router.replace(planHref)
    router.refresh()
  }

  return <ActivityPlayer
    activity={activity}
    initialRun={initialRun}
    runtime={runtime}
    retakeBaselineAttemptIds={retakeBaselineAttemptIds}
    onClose={() => router.push(planHref)}
    onFinish={finish}
    responseMediaOwner={{ type: 'user', id: Number(session?.data?.user?.id) }}
  />
}
