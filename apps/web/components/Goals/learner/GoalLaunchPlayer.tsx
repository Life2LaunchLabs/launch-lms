'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { ActivityPlayer, type ActivityRuntime } from '@components/Learning/player/ActivityPlayer'
import { OptionSourceContext } from '@components/Learning/player/OptionSources'
import { completeLearningPage, submitLearningResponse } from '@services/learning/learning'
import { goalLaunchApi } from '@services/goals/launch'
import { goalsApi, goalsUrl, goalUrl, isGoalsKey } from '@services/goals/goals'
import { getUriWithOrg } from '@services/config/config'

/**
 * The launch flow for a new goal. Each answer lands on the draft goal as it is given; finishing
 * makes the goal active and opens it to shape. Closing keeps the draft for later.
 */
export default function GoalLaunchPlayer({ orgslug, goalUuid, activity, initialRun }: { orgslug: string; goalUuid: string; activity: any; initialRun: any }) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const runUuidRef = React.useRef<string | undefined>(initialRun?.run_uuid)

  const runtime = React.useMemo<ActivityRuntime>(() => ({
    start: async () => {
      const started = await goalLaunchApi.start({ goal_uuid: goalUuid }, accessToken)
      runUuidRef.current = started?.run?.run_uuid
      return started?.run
    },
    submit: (pageUuid, answer, button) => submitLearningResponse(runUuidRef.current || '', pageUuid, answer, accessToken, button),
    complete: (pageUuid, button) => completeLearningPage(runUuidRef.current || '', pageUuid, button ? { button } : {}, accessToken),
  }), [goalUuid, accessToken])

  const leave = (path: string) => {
    void mutate((key) => isGoalsKey(key))
    router.replace(getUriWithOrg(orgslug, path))
    router.refresh()
  }
  // The goal page sends a draft back here, so it must not open on a copy cached while the goal
  // was still a draft: put the live goal, and the list it now belongs to, in the cache first, then
  // open it, so its header doesn't rebuild once the list arrives.
  const finish = async () => {
    await Promise.all([
      mutate(goalUrl(goalUuid), goalsApi.get(goalUuid, accessToken), { revalidate: false }),
      mutate(goalsUrl('?include_finished=true'), goalsApi.list(accessToken), { revalidate: false }),
    ]).catch(() => undefined) /* the page fetches them */
    leave(`/plans/${encodeURIComponent(goalUuid)}`)
  }
  const sources = React.useMemo(() => ({ goalUuid, token: accessToken }), [goalUuid, accessToken])

  return <OptionSourceContext.Provider value={sources}>
    <ActivityPlayer
      activity={activity}
      initialRun={initialRun}
      runtime={runtime}
      onClose={() => leave('/plans')}
      onFinish={() => void finish()}
      responseMediaOwner={{ type: 'user', id: Number(session?.data?.user?.id) }}
    />
  </OptionSourceContext.Provider>
}
