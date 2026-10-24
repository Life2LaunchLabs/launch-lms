import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { Achievement, BadgeOrg, BadgeSummary } from '@services/badges/badges'
import type { GoalIcon } from './types'

async function request(path: string, token?: string, next?: any, method = 'GET', body: any = null) {
  const response = await fetch(`${getAPIUrl()}plan-joining/${path}`, RequestBodyWithAuthHeader(method, body, next ?? null, token))
  return errorHandling(response)
}

const query = (params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([key, value]) => [key, String(value)]))
  return search.size ? `?${search}` : ''
}

/** The learner's own plan from this template, with how far along it is. */
export type JoinedGoal = { goal_uuid: string; title: string; status: string; org_id: number | null; done: number; total: number }

/** One organization offering one plan to learners: open (start now) or by request. */
export type PlanOfferCard = {
  template_uuid: string
  title: string
  description: string
  thumbnail_image: string
  icon: GoalIcon | null
  color: string | null
  stage_count: number
  step_count: number
  badge: BadgeSummary | null
  creator: BadgeOrg | null
  org: BadgeOrg | null
  access: 'open' | 'request'
  /** Where the learner is with it: they have it, they earned its badge, they asked, or nothing yet. */
  state: 'joined' | 'earned' | 'requested' | 'accepted' | 'rejected' | 'none'
  goal: JoinedGoal | null
  update_date: string
}

export type DiscoverPlanCollection = {
  collection_uuid: string
  name: string
  description: string
  categories: string[]
  org: BadgeOrg | null
  plans: PlanOfferCard[]
}

export type DiscoverSlideKind = 'plan' | 'collection' | 'link' | 'challenges'
export type DiscoverSlideConfig = { kind: DiscoverSlideKind; target: string; title: string; description: string; eyebrow: string; action_label: string; image_url: string; thumbnail_url: string; theme: 'blue' | 'dark' | 'light' }
export type DiscoverSettings = { enabled: boolean; mode: 'automatic' | 'curated'; slides: DiscoverSlideConfig[] }
export type DiscoverSettingsResponse = { settings: DiscoverSettings; options: Record<'plans' | 'collections', { id: string; name: string }[]> }
export type DiscoverHeroSlide = Omit<DiscoverSlideConfig, 'target'> & { key: string; href: string; plan?: PlanOfferCard; collection?: DiscoverPlanCollection }

export type DiscoverFeed = {
  hero_slides: DiscoverHeroSlide[]
  featured: PlanOfferCard[]
  keep_going: PlanOfferCard[]
  collections: DiscoverPlanCollection[]
  /** Plans the learner can still join (one card per plan). */
  plans: PlanOfferCard[]
  earned_count: number
}

export type PlanOutlineStep = { title: string; type: string; description: string; requirement_node_uuids: string[] }

/** A plan's public page, which is also its badge's criteria page. */
export type PublicPlanPage = {
  template_uuid: string
  title: string
  description: string
  thumbnail_image: string
  icon: GoalIcon | null
  color: string | null
  version: string | null
  creator: BadgeOrg | null
  stages: { title: string; description: string; steps: PlanOutlineStep[] }[]
  badge: Achievement | null
  offers: PlanOfferCard[]
  goal: JoinedGoal | null
}

export type JoinResult = { status: 'joined'; goal_uuid: string } | { status: 'requested'; request_uuid: string }

export type JoinRequest = {
  request_uuid: string
  status: 'requested' | 'accepted' | 'rejected'
  message: string
  creation_date: string
  decided_at: string | null
  goal_uuid: string | null
  plan: { template_uuid: string; title: string; thumbnail_image: string } | null
  user: { id: number; user_uuid: string; username: string; first_name: string; last_name: string; avatar_image?: string | null } | null
}

export const JOIN_REQUESTS_KEY = 'plan-join-requests'
export const DISCOVER_FEED_KEY = 'plan-discover'

/** Learners finding plans organizations offer and joining them; organizations answering requests. */
export const planJoiningApi = {
  discover: (token?: string, orgId?: number, siteOrgId?: number, next?: any): Promise<DiscoverFeed> => request(`discover${query({ org_id: orgId, site_org_id: siteOrgId })}`, token, next),
  settings: (orgId: number, token: string): Promise<DiscoverSettingsResponse> => request(`discover/settings${query({ org_id: orgId })}`, token),
  saveSettings: (orgId: number, settings: DiscoverSettings, token: string): Promise<DiscoverSettingsResponse> => request(`discover/settings${query({ org_id: orgId })}`, token, undefined, 'PUT', settings),
  plan: (templateUuid: string, token?: string, orgId?: number, next?: any): Promise<PublicPlanPage> => request(`plans/${encodeURIComponent(templateUuid)}${query({ org_id: orgId })}`, token, next),
  join: (templateUuid: string, orgId: number, token: string, message = ''): Promise<JoinResult> => request(`plans/${encodeURIComponent(templateUuid)}/join`, token, undefined, 'POST', { org_id: orgId, message }),
  cancel: (templateUuid: string, orgId: number, token: string): Promise<{ status: 'none' }> => request(`plans/${encodeURIComponent(templateUuid)}/request${query({ org_id: orgId })}`, token, undefined, 'DELETE'),
  requests: (orgId: number, token: string, status = 'requested'): Promise<JoinRequest[]> => request(`requests${query({ org_id: orgId, status })}`, token),
  accept: (requestUuid: string, token: string): Promise<JoinRequest> => request(`requests/${encodeURIComponent(requestUuid)}/accept`, token, undefined, 'POST'),
  reject: (requestUuid: string, token: string): Promise<JoinRequest> => request(`requests/${encodeURIComponent(requestUuid)}/reject`, token, undefined, 'POST'),
}
