'use client'

import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { planningApi } from '@services/planning/planning'

// eslint-disable-next-line no-unused-vars
export default function useQuickCreatePlan(token: string | undefined, onCreated: (plan: any) => Promise<void>) {
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const quickCreate = async () => {
    if (!token || pending.current) return
    pending.current = true; setBusy(true)
    try {
      const plan = await planningApi.create({ name: 'New plan' }, token)
      await onCreated(plan)
    } catch (error: any) { toast.error(error?.message || 'Could not create your plan. Please try again.') }
    finally { pending.current = false; setBusy(false) }
  }
  return { quickCreate, busy }
}
