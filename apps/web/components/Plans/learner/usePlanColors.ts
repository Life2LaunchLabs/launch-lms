'use client'

import React from 'react'
import type { PlanTarget } from '../PlanEditorShared'

const PLAN_COLORS = ['#7c3aed', '#0f9f9a', '#d97706', '#2563eb', '#db2777', '#65a30d', '#dc2626', '#0891b2']

function fallbackPlanColor(planUuid = '') {
  const hash = Array.from(planUuid).reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 0)
  return PLAN_COLORS[hash % PLAN_COLORS.length]
}

export default function usePlanColors(plans: PlanTarget[], viewerId: string | number | undefined) {
  const storageKey = `launchlms:plan-colors:${viewerId || 'viewer'}`
  const [colors, setColors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    try { setColors(JSON.parse(window.localStorage.getItem(storageKey) || '{}')) } catch { setColors({}) }
  }, [storageKey])

  React.useEffect(() => {
    if (!plans.length) return
    setColors((current) => {
      const next = { ...current }
      const used = new Set(Object.values(next))
      let changed = false
      for (const plan of plans) {
        if (next[plan.plan_uuid]) continue
        next[plan.plan_uuid] = PLAN_COLORS.find((color) => !used.has(color)) || fallbackPlanColor(plan.plan_uuid)
        used.add(next[plan.plan_uuid])
        changed = true
      }
      if (changed) window.localStorage.setItem(storageKey, JSON.stringify(next))
      return changed ? next : current
    })
  }, [plans, storageKey])

  const setPlanColor = (planUuid: string, color: string) => setColors((current) => {
    const next = { ...current, [planUuid]: color }
    window.localStorage.setItem(storageKey, JSON.stringify(next))
    return next
  })
  return { getPlanColor: (planUuid?: string) => colors[planUuid || ''] || fallbackPlanColor(planUuid), setPlanColor }
}

