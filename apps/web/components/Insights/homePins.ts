'use client'

import useSWR, { mutate as revalidate } from 'swr'
import toast from 'react-hot-toast'
import { adminHomeApi, adminHomeKey, homePinsKey, type HomePin } from '@services/goals/adminHome'
import type { CardPin } from './InsightCard'

const MAX_PINS = 6
const same = (a: HomePin, b: HomePin) => a.dashboard_uuid === b.dashboard_uuid && a.card_key === b.card_key && (a.scope_key || null) === (b.scope_key || null)

/** The cards this member pinned to Home, and a pin toggle for each card on a dashboard. */
export function useHomePins(orgId: number, token?: string) {
  const { data, mutate } = useSWR(orgId && token ? homePinsKey(orgId) : null, () => adminHomeApi.pins(orgId, token), { revalidateOnFocus: false })
  const pins = data?.pins || []
  const save = async (next: HomePin[], message: string) => {
    try {
      await mutate(async () => adminHomeApi.savePins(orgId, next, token), { optimisticData: { pins: next }, rollbackOnError: true, revalidate: false })
      void revalidate(adminHomeKey(orgId))
      toast.success(message)
    } catch (error: any) {
      toast.error(error?.message || 'Couldn’t change your Home')
    }
  }
  const pinFor = (pin: HomePin): CardPin | undefined => {
    if (!data) return undefined
    const pinned = pins.some((item) => same(item, pin))
    return {
      pinned,
      onToggle: () => {
        if (pinned) return void save(pins.filter((item) => !same(item, pin)), 'Taken off Home')
        if (pins.length >= MAX_PINS) return void toast.error(`Home holds ${MAX_PINS} cards. Unpin one first.`)
        void save([...pins, pin], 'Pinned to Home')
      },
    }
  }
  return { pins, pinFor }
}
