import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

async function request(path: string, token?: string, next?: any, method = 'GET', body: any = null) {
  const response = await fetch(`${getAPIUrl()}badges/${path}`, RequestBodyWithAuthHeader(method, body, next ?? null, token))
  return errorHandling(response)
}

/** The learner's goal for a badge, as badge pages embed it. */
export type BadgeGoal = { goal_uuid: string; title?: string; done: number; total: number; status: string }

export type BadgeCard = {
  badge_uuid: string
  name: string
  description: string
  thumbnail_image: string
  status: 'draft' | 'coming_soon' | 'published'
  subtitle: string
  time_label: string
  creator: { id: number; name: string; slug: string; logo_image: string; org_uuid: string } | null
  route_count: number
  collection: { collection_uuid: string; name: string } | null
  earned: boolean
  /** The learner's active goal for this badge, once they've started it. */
  goal: BadgeGoal | null
}

export type BadgeCollectionPage = {
  collection_uuid: string
  name: string
  description: string
  thumbnail_image: string
  creator: BadgeCard['creator']
  credibility: string
  endorsers: { name: string; logo_url?: string; url?: string }[]
  badges: BadgeCard[]
}

export type BadgeRoute = {
  route_uuid: string
  template_uuid: string
  name: string
  description: string
  recommended: boolean
  step_order: string
  step_count: number
  activity_count: number
  steps: { title: string; kind: string; chapter: string }[]
  issuers: { org: { id: number; name: string; org_uuid?: string; logo_image?: string }; access: string; can_start: boolean; is_creator: boolean; request_status: string | null }[]
}

export type BadgePage = BadgeCard & {
  about: string
  criteria: string
  trust_line: string
  proves: { title: string; body?: string; media_url?: string }[]
  collection: BadgeCollectionPage | null
  ways: { badge_uuid: string; routes: BadgeRoute[]; goal: BadgeGoal | null }
}

export type DiscoverSlideKind = 'badge' | 'collection' | 'link' | 'challenges'
export type DiscoverSlideConfig = { kind: DiscoverSlideKind; target: string; title: string; description: string; eyebrow: string; action_label: string; image_url: string; thumbnail_url: string; theme: 'blue' | 'dark' | 'light' }
export type DiscoverSettings = { enabled: boolean; mode: 'automatic' | 'curated'; slides: DiscoverSlideConfig[] }
export type DiscoverSettingsResponse = { settings: DiscoverSettings; options: Record<'badges' | 'collections', { id: string; name: string }[]> }
export type DiscoverHeroSlide = Omit<DiscoverSlideConfig, 'target'> & { key: string; href: string; badge?: BadgeCard; collection?: BadgeCollectionPage }

export type DiscoverFeed = {
  hero_slides: DiscoverHeroSlide[]
  featured: BadgeCard[]
  keep_going: BadgeCard[]
  collections: BadgeCollectionPage[]
  badges: BadgeCard[]
  earned_count: number
}

const clean = (value: string) => encodeURIComponent(value)

/** Learner-facing badge reads: the Discover feed, a badge's page and a collection's page. */
export const badgeDiscoverApi = {
  discover: (token?: string, orgId?: number, siteOrgId?: number): Promise<DiscoverFeed> => request(`discover?${new URLSearchParams({ ...(orgId ? { org_id: String(orgId) } : {}), ...(siteOrgId ? { site_org_id: String(siteOrgId) } : {}) })}`, token),
  settings: (orgId: number, token: string): Promise<DiscoverSettingsResponse> => request(`discover/settings?org_id=${orgId}`, token),
  saveSettings: (orgId: number, settings: DiscoverSettings, token: string): Promise<DiscoverSettingsResponse> => request(`discover/settings?org_id=${orgId}`, token, undefined, "PUT", settings),
  badge: (badgeUuid: string, token?: string, next?: any): Promise<BadgePage> => request(`${clean(badgeUuid)}/page`, token, next),
  collection: (collectionUuid: string, token?: string, next?: any): Promise<BadgeCollectionPage> => request(`collections/${clean(collectionUuid)}`, token, next),
}
