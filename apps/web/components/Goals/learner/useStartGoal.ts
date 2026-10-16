'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { goalLaunchApi } from '@services/goals/launch'
import { getUriWithOrg } from '@services/config/config'

export const launchPath = (goalUuid: string) => `/plans/${encodeURIComponent(goalUuid)}/launch`

/** Starts a new goal: a draft, opened in the launch flow to set it up. */
export default function useStartGoal(orgslug: string, token: string | undefined) {
  const router = useRouter()
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const startGoal = async () => {
    if (!token || pending.current) return
    pending.current = true; setBusy(true)
    try {
      const launch = await goalLaunchApi.start({}, token)
      router.push(getUriWithOrg(orgslug, launchPath(launch.goal.goal_uuid)))
    } catch (error: any) {
      toast.error(error?.message || 'Could not start your goal. Please try again.')
      pending.current = false; setBusy(false)
    }
  }
  return { startGoal, busy }
}
