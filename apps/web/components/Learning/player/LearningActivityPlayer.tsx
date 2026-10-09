'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { completeLearningPage, startLearningRun, submitLearningResponse } from '@services/learning/learning'
import { getUriWithOrg } from '@services/config/config'
import { ActivityPlayer, type ActivityRuntime, getActivityResult } from './ActivityPlayer'

export function LearningActivityPlayer({ orgslug, badgePath, activity }: { orgslug: string; badgePath: any; activity: any }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const programAssignmentUuid = searchParams.get('assignment') || undefined
  const planObjectiveUuid = searchParams.get('planObjective') || undefined
  const badge = badgePath.badge
  const issuingOrgId = badgePath?.enrollment?.accepted_issuer_org_id
  const runUuidRef = React.useRef<string | undefined>(badgePath.run?.run_uuid)
  const [retakeBaselineAttemptIds] = React.useState<Set<string>>(() => {
    const isRetake = getActivityResult(badgePath.run, activity)?.status === 'failed'
    return new Set(isRetake ? (badgePath.run?.attempts || []).map((attempt: any) => attempt.attempt_uuid) : [])
  })

  const runtime = React.useMemo<ActivityRuntime>(() => ({
    start: async () => {
      const run = await startLearningRun(badge.badge_uuid, accessToken, issuingOrgId, programAssignmentUuid, planObjectiveUuid)
      runUuidRef.current = run?.run_uuid
      return run
    },
    submit: (pageUuid, answer, button) => submitLearningResponse(runUuidRef.current || '', pageUuid, answer, accessToken, button),
    complete: (pageUuid, button) => completeLearningPage(runUuidRef.current || '', pageUuid, button ? { button } : {}, accessToken),
  }), [badge.badge_uuid, accessToken, issuingOrgId, programAssignmentUuid, planObjectiveUuid])

  const leave = React.useCallback(() => {
    const returnTo = searchParams.get('returnTo')
    if (returnTo?.startsWith('/portfolio')) {
      router.push(getUriWithOrg(orgslug, returnTo))
      return true
    }
    return false
  }, [orgslug, router, searchParams])

  const finish = (run: any) => {
    const grading = activity.settings?.grading || {}
    const result = getActivityResult(run, activity)
    if (result?.scored) {
      if (result.status === 'pending') {
        toast.success('Activity submitted for review.')
      } else if (result.status === 'failed') {
        toast.error(grading.failure_message || 'Activity finished. Review your answers and try again when you are ready.')
      } else {
        toast.success(grading.success_message || 'Activity passed.')
      }
    }
    if (!leave()) {
      router.replace(getUriWithOrg(orgslug, `/badges/${badge.badge_uuid}/path${programAssignmentUuid ? `?assignment=${encodeURIComponent(programAssignmentUuid)}` : ''}`))
      router.refresh()
    }
  }

  return (
    <ActivityPlayer
      activity={activity}
      initialRun={badgePath.run}
      runtime={runtime}
      retakeBaselineAttemptIds={retakeBaselineAttemptIds}
      onClose={() => { if (!leave()) router.back() }}
      onFinish={finish}
      responseMediaOwner={{ type: 'user', id: Number(session?.data?.user?.id) }}
    />
  )
}
