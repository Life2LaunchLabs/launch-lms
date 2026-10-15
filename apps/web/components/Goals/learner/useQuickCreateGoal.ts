'use client'

import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { goalsApi } from '@services/goals/goals'
import type { Goal } from '@services/goals/types'

/** Creates a personal goal called "New goal" in one tap; the caller opens it for editing. */
// eslint-disable-next-line no-unused-vars
export default function useQuickCreateGoal(token: string | undefined, onCreated: (goal: Goal) => Promise<void>) {
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const quickCreate = async () => {
    if (!token || pending.current) return
    pending.current = true; setBusy(true)
    try {
      const goal = await goalsApi.create({ title: 'New goal' }, token)
      await onCreated(goal)
    } catch (error: any) { toast.error(error?.message || 'Could not create your goal. Please try again.') }
    finally { pending.current = false; setBusy(false) }
  }
  return { quickCreate, busy }
}
