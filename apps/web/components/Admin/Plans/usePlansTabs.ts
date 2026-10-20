'use client'

import useSWR from 'swr'
import toast from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { adminHomeApi, plansTabsKey, type PlansTabsPreference } from '@services/goals/adminHome'
import { arrangePlansTabs, movePlansTab, PLANS_TAB_IDS, type PlansTabId } from '@/lib/admin/plansTabs'

/**
 * The viewer's own order for the Plans tabs, kept on their membership (`plans_tabs` preference).
 * Until it loads, tabs show in the usual order. `move` and `reset` save straight away.
 * Pass `enabled: false` where the viewer has no Plans tab, so nothing is fetched.
 */
export function usePlansTabs(enabled = true) {
  const org = useOrg() as { id?: number } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string } } }
  const orgId = Number(org?.id)
  const token = session?.data?.tokens?.access_token
  const { data, mutate } = useSWR<PlansTabsPreference>(enabled && orgId && token ? plansTabsKey(orgId) : null, () => adminHomeApi.plansTabs(orgId, token), { revalidateOnFocus: false })
  const defaultOrder = arrangePlansTabs(data?.default, PLANS_TAB_IDS)
  const order = arrangePlansTabs(data?.order, defaultOrder)

  const save = (next: PlansTabId[], saved: boolean) => mutate(adminHomeApi.savePlansTabs(orgId, saved ? next : [], token), {
    optimisticData: { order: next, default: defaultOrder, saved },
    rollbackOnError: true,
    populateCache: true,
    revalidate: false,
  }).catch(() => toast.error('Could not save the tab order.'))

  return {
    order,
    defaultOrder,
    /** Whether the viewer saved their own order (Reset only matters then). */
    saved: Boolean(data?.saved),
    loaded: Boolean(data),
    move: (id: PlansTabId, step: -1 | 1) => {
      const next = movePlansTab(order, id, step)
      if (next.join() !== order.join()) void save(next, true)
    },
    reset: () => save(defaultOrder, false),
  }
}
