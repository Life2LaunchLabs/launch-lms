'use client'

import React from 'react'
import { PLAN_COLORS, planPalette } from '@components/Goals/planColors'

// Colours are a per-browser preference; storage can be unavailable (private windows), so never let it throw.
function remember(key: string, colors: Record<string, string>) {
  try { window.localStorage.setItem(key, JSON.stringify(colors)) } catch { /* keep this session's colours only */ }
}

function fallbackGoalColor(goalUuid = '') {
  const hash = Array.from(goalUuid).reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 0)
  return PLAN_COLORS[hash % PLAN_COLORS.length]
}

/**
 * Each goal's colour, remembered per browser. The storage key is the one plans used, and
 * goal uuids are the plans' uuids, so learners keep the colours they already had.
 */
export default function useGoalColors(goals: Array<{ goal_uuid?: string }>, viewerId: string | number | undefined) {
  const storageKey = `launchlms:plan-colors:${viewerId || 'viewer'}`
  const [colors, setColors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    // Older entries hold the previous palette's hexes; map them onto the current faces.
    try { setColors(Object.fromEntries(Object.entries(JSON.parse(window.localStorage.getItem(storageKey) || '{}') as Record<string, string>).map(([uuid, color]) => [uuid, planPalette(color).face]))) } catch { setColors({}) }
  }, [storageKey])

  React.useEffect(() => {
    if (!goals.length) return
    setColors((current) => {
      const next = { ...current }
      const used = new Set(Object.values(next))
      let changed = false
      for (const goal of goals) {
        if (!goal.goal_uuid || next[goal.goal_uuid]) continue
        next[goal.goal_uuid] = PLAN_COLORS.find((color) => !used.has(color)) || fallbackGoalColor(goal.goal_uuid)
        used.add(next[goal.goal_uuid])
        changed = true
      }
      if (changed) remember(storageKey, next)
      return changed ? next : current
    })
  }, [goals, storageKey])

  const setGoalColor = React.useCallback((goalUuid: string, color: string) => setColors((current) => {
    const next = { ...current, [goalUuid]: color }
    remember(storageKey, next)
    return next
  }), [storageKey])
  const getGoalColor = React.useCallback((goalUuid?: string) => colors[goalUuid || ''] || fallbackGoalColor(goalUuid), [colors])
  return { getGoalColor, setGoalColor }
}
