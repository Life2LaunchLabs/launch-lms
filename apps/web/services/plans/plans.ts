/**
 * Plan utilities for the frontend.
 *
 * All plan data (feature configs, limits, requirements) lives in the API.
 * The frontend reads `resolved_features` from the org config returned by the API.
 *
 * This file only provides:
 *   - PlanLevel type
 *   - Plan hierarchy for UI comparisons (plan badges, upgrade prompts)
 *   - Core capability helpers for globally disabled features
 */

import { getCoreCapabilities } from '@services/config/config'

export type PlanLevel = 'free' | 'personal' | 'family' | 'standard' | 'pro' | 'enterprise'

export const PLAN_HIERARCHY: PlanLevel[] = ['free', 'personal', 'family', 'standard', 'pro', 'enterprise']

/**
 * Check if the current plan meets or exceeds the required plan level.
 * Only used in SaaS mode — EE/OSS bypass is handled in isFeatureAvailable().
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
 * Check if a feature is available based on deployment mode.
 *
 * In SaaS mode, feature availability is determined by `resolved_features`
 * from the API — this function only handles mode-level bypass:
 * - OSS: EE-only features blocked, all others allowed
 * - EE: all features allowed
 * - SaaS: always returns true (callers should check resolved_features)
 */
export function isFeatureAvailable(featureKey: string, _currentPlan?: PlanLevel): boolean {
  const capabilities = getCoreCapabilities()
  const capabilityKey = featureKey === 'analytics_advanced' ? 'advanced_analytics' : featureKey
  if (capabilityKey in capabilities) {
    return capabilities[capabilityKey as keyof typeof capabilities]
  }
  return true
}
