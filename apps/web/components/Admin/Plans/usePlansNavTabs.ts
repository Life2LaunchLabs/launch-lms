'use client'

import { routePaths } from '@services/routing/paths'
import type { VisibleNavItem } from '@/lib/admin/registry'
import { usePlansTabs } from './usePlansTabs'

/** The menu's tabs with Plans opening on the viewer's own first tab (Badges for a badge-making org, say). */
export function usePlansNavTabs(tabs: VisibleNavItem[]): VisibleNavItem[] {
  const plans = tabs.find((tab) => tab.id === 'plans' && tab.visibility.state === 'open')
  const { order } = usePlansTabs(Boolean(plans))
  if (!plans) return tabs
  const href = routePaths.org.admin.plans(order[0])
  return tabs.map((tab) => (tab === plans ? { ...tab, href } : tab))
}
