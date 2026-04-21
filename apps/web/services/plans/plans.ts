/**
 * Plan utilities for the frontend.
 *
 * All plan data (feature configs, limits, requirements) lives in the API.
 * The frontend reads `resolved_features` from the org config returned by the API.
 *
 * This file only provides:
 *   - PlanLevel type
 *   - Plan hierarchy for UI comparisons (plan badges, upgrade prompts)
 *   - Instance capability helpers for globally disabled features
 */

import { getCoreCapabilities } from '@services/config/config'

export type PlanLevel = 'free' | 'full' | 'enterprise'

export const PLAN_HIERARCHY: PlanLevel[] = ['free', 'full', 'enterprise']

export const PLAN_LABELS: Record<PlanLevel, string> = {
  free: 'Free',
  full: 'Full',
  enterprise: 'Enterprise',
}

/**
 * Check if the current plan meets or exceeds the required plan level.
 * Used for org-plan comparisons in the UI.
 */
export function planMeetsRequirement(
  currentPlan: PlanLevel,
  requiredPlan: PlanLevel
): boolean {
  const currentIndex = PLAN_HIERARCHY.indexOf(currentPlan)
  const requiredIndex = PLAN_HIERARCHY.indexOf(requiredPlan)
  return currentIndex >= requiredIndex
}

/**
 * Check if a feature is available in this deployment.
 */
export function isFeatureAvailable(featureKey: string, _currentPlan?: PlanLevel): boolean {
  const capabilities = getCoreCapabilities()
  const capabilityKey = featureKey === 'analytics_advanced' ? 'advanced_analytics' : featureKey
  if (capabilityKey in capabilities) {
    return capabilities[capabilityKey as keyof typeof capabilities]
  }
  return true
}
