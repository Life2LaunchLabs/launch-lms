/**
 * Org access types for the frontend.
 *
 * What an org may use is decided by the API (`security/access`) and sent with the org as
 * `config.config.access`: its tier, partner programs, each feature with what would unlock it,
 * and its counted limits (0 = unlimited). The web never works access out for itself.
 */

export type Tier = 'free' | 'full' | 'enterprise'

export const TIERS: Tier[] = ['free', 'full', 'enterprise']

export const TIER_LABELS: Record<Tier, string> = {
  free: 'Free',
  full: 'Full',
  enterprise: 'Enterprise',
}

export const PARTNER_LABELS: Record<string, string> = {
  badge_publisher: 'Verified badge publisher',
  plan_publisher: 'Plan publisher',
  resource_partner: 'Resource partner',
}

export const FEATURE_LABELS: Record<string, string> = {
  groups: 'Groups',
  bulk_invites: 'Bulk invites',
  advanced_reports: 'Advanced reporting',
  sso: 'Single sign-on',
  audit_logs: 'Audit logs',
  api_tokens: 'API tokens',
  payments: 'Payments',
  badge_publishing: 'Badge publishing',
  plan_publishing: 'Plan publishing',
  resource_publishing: 'Resource publishing',
  // Legacy, switched off for everyone.
  podcasts: 'Podcasts',
  playgrounds: 'Playgrounds',
}

export const REQUEST_KINDS: Record<string, string> = {
  tier_upgrade: 'Tier upgrade',
  partner_application: 'Partner program',
  feature_request: 'Feature',
}

export type AccessRequest = { type: 'tier_upgrade' | 'partner_application' | 'feature_request'; value: string }

export type FeatureAccess = { enabled: boolean; unlock: AccessRequest | null }

export type OrgAccess = {
  tier: Tier
  owner: boolean
  partners: string[]
  features: Record<string, FeatureAccess>
  limits: Record<string, number>
}

export const NO_ACCESS: OrgAccess = { tier: 'free', owner: false, partners: [], features: {}, limits: {} }

export function tierLabel(tier: string | null | undefined): string {
  return TIER_LABELS[(tier || 'free') as Tier] ?? tier ?? 'Free'
}

export function accessRequestLabel(request: AccessRequest): string {
  if (request.type === 'tier_upgrade') return `${tierLabel(request.value)} tier`
  if (request.type === 'partner_application') return PARTNER_LABELS[request.value] ?? request.value
  return FEATURE_LABELS[request.value] ?? request.value
}
