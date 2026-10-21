'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { ActivityPlayer, type ActivityRuntime } from '@components/Learning/player/ActivityPlayer'
import { goalLifecycleApi } from '@services/goals/lifecycle'
import { goalsUrl, isGoalsKey } from '@services/goals/goals'
import { getUriWithOrg } from '@services/config/config'

/** A run kept in the page: the story asks nothing, so nothing is saved but having seen it. */
function storyRun(activity: any, done: string[]): any {
  const path = (activity.pages || []).map((page: any) => page.page_uuid)
  const required = (activity.pages || []).filter((page: any) => page.required).map((page: any) => page.page_uuid)
  return {
    run_uuid: activity.activity_uuid, attempts: [], render_context: { answers: {}, variables: {} },
    status: required.every((uuid: string) => done.includes(uuid)) ? 'completed' : 'in_progress',
    navigation: { path, current_page_uuid: path.find((uuid: string) => !done.includes(uuid)) || null, completed: done.length, total: path.length },
  }
}

/** Plays a finished goal's story. Finishing or closing it marks the goal celebrated and opens the goal. */
export default function GoalStoryPlayer({ orgslug, goalUuid, activity }: { orgslug: string; goalUuid: string; activity: any }) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const done = React.useRef<string[]>([])
  const initialRun = React.useMemo(() => storyRun(activity, []), [activity])

  const runtime = React.useMemo<ActivityRuntime>(() => ({
    submit: async () => storyRun(activity, done.current),
    complete: async (pageUuid) => {
      if (!done.current.includes(pageUuid)) done.current = [...done.current, pageUuid]
      return storyRun(activity, done.current)
    },
  }), [activity])

  const leave = async () => {
    // Seen is best effort: if it fails, the story simply greets the learner once more.
    try { if (accessToken) await goalLifecycleApi.celebrated(goalUuid, accessToken) } catch { /* noop */ }
    // The goals page must not see this goal as still waiting to greet the learner.
    await mutate(goalsUrl('/home'), (data: any) => data ? { ...data, celebrations: (data.celebrations || []).filter((uuid: string) => uuid !== goalUuid) } : data, { revalidate: false })
    void mutate((key) => isGoalsKey(key))
    router.replace(getUriWithOrg(orgslug, `/plans/${encodeURIComponent(goalUuid)}`))
    router.refresh()
  }

  return <ActivityPlayer activity={activity} initialRun={initialRun} runtime={runtime} onClose={() => void leave()} onFinish={() => void leave()} finishLabel="Done"
    responseMediaOwner={{ type: 'user', id: Number(session?.data?.user?.id) }} />
}
