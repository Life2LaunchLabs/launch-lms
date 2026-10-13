'use client'

import React from 'react'
import type { PlanTarget } from '../PlanEditorShared'
import { PLAN_COLORS, planPalette } from './planColors'

// Colors are a per-browser preference; storage can be unavailable (private windows), so never let it throw.
function remember(key: string, colors: Record<string, string>) {
  try { window.localStorage.setItem(key, JSON.stringify(colors)) } catch { /* keep this session's colors only */ }
}

function fallbackPlanColor(planUuid = '') {
  const hash = Array.from(planUuid).reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 0)
  return PLAN_COLORS[hash % PLAN_COLORS.length]
}

export default function usePlanColors(plans: PlanTarget[], viewerId: string | number | undefined) {
  const storageKey = `launchlms:plan-colors:${viewerId || 'viewer'}`
  const [colors, setColors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    // Older entries hold the previous palette's hexes; map them onto the current faces.
    try { setColors(Object.fromEntries(Object.entries(JSON.parse(window.localStorage.getItem(storageKey) || '{}') as Record<string, string>).map(([uuid, color]) => [uuid, planPalette(color).face]))) } catch { setColors({}) }
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
      if (changed) remember(storageKey, next)
      return changed ? next : current
    })
  }, [plans, storageKey])

  const setPlanColor = (planUuid: string, color: string) => setColors((current) => {
    const next = { ...current, [planUuid]: color }
    remember(storageKey, next)
    return next
  })
  return { getPlanColor: (planUuid?: string) => colors[planUuid || ''] || fallbackPlanColor(planUuid), setPlanColor }
}

