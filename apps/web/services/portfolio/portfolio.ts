import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export async function getMyPortfolio(token: string, preview = false) {
  const response = await fetch(`${getAPIUrl()}portfolio/me${preview ? '/preview' : ''}`, RequestBodyWithAuthHeader('GET', null, { revalidate: 0 }, token))
  return normalizeTimelineProjects(await errorHandling(response))
}

export async function getPublicPortfolio(orgId: number, username: string) {
  const response = await fetch(`${getAPIUrl()}public/portfolio/${orgId}/${encodeURIComponent(username)}`, { cache: 'no-store' })
  return normalizeTimelineProjects(await errorHandling(response))
}

function normalizeTimelineProjects<T extends { timeline?: Array<Record<string, any>> | Record<string, any> }>(shell: T): T {
  if (Array.isArray(shell?.timeline)) return { ...shell, timeline: shell.timeline.map((entry) => ({ ...entry, projects: entry.projects || [], project: entry.projects || [] })) }
  if (shell?.timeline && typeof shell.timeline === 'object') return { ...shell, timeline: { ...shell.timeline, projects: shell.timeline.projects || [], project: shell.timeline.projects || [] } }
  return shell
}

export async function getPublicPortfolioProject(orgId: number, username: string, slug: string) {
  const response = await fetch(`${getAPIUrl()}public/portfolio/${orgId}/${encodeURIComponent(username)}/projects/${encodeURIComponent(slug)}`, { cache: 'no-store' })
  return errorHandling(response)
}

export async function getPublicPortfolioTimeline(orgId: number, username: string, slug: string) {
  const response = await fetch(`${getAPIUrl()}public/portfolio/${orgId}/${encodeURIComponent(username)}/timeline/${encodeURIComponent(slug)}`, { cache: 'no-store' })
  return normalizeTimelineProjects(await errorHandling(response))
}

async function mutate(path: string, method: string, payload: unknown, token: string) {
  const response = await fetch(`${getAPIUrl()}portfolio/${path}`, RequestBodyWithAuthHeader(method, payload, null, token))
  return errorHandling(response)
}

export const updateMyPortfolio = (payload: unknown, token: string) => mutate('me', 'PATCH', payload, token)
export const updateMyPortfolioTraits = (payload: { trait_type: 'strength' | 'value'; labels: string[] }, token: string) => mutate('me/traits', 'PUT', payload, token)
export const updateMyPortfolioFeaturedBadges = (payload: { badge_uuids: string[] }, token: string) => mutate('me/featured-badges', 'PUT', payload, token)
export const updateMyPortfolioFeaturedProject = (payload: { project_uuid?: string | null; project_uuids?: string[] }, token: string) => mutate('me/featured-projects', 'PUT', payload, token)
export const updateMyPortfolioFeaturedTimeline = (payload: { timeline_uuids: string[] }, token: string) => mutate('me/featured-timeline', 'PUT', payload, token)
export const updateMyPortfolioBadgeVisibility = (payload: { hidden_badge_uuids: string[]; revision: number }, token: string) => mutate('me/badge-visibility', 'PUT', payload, token)
export const updateMyPortfolioSections = (payload: { sections: Array<{ section_uuid: string; enabled: boolean }>; revision: number }, token: string) => mutate('me/sections', 'PUT', payload, token)
export const createPortfolioProject = (payload: unknown, token: string) => mutate('me/projects', 'POST', payload, token)
export const updatePortfolioProject = (uuid: string, payload: unknown, token: string) => mutate(`me/projects/${uuid}`, 'PATCH', payload, token)
export const createPortfolioTimeline = (payload: unknown, token: string) => mutate('me/timeline', 'POST', payload, token)
export const updatePortfolioTimeline = (uuid: string, payload: unknown, token: string) => mutate(`me/timeline/${uuid}`, 'PATCH', payload, token)
export const publishMyPortfolio = (payload: unknown, token: string) => mutate('me/publish', 'POST', payload, token)
export const unpublishMyPortfolio = (revision: number, token: string) => mutate(`me/unpublish?revision=${encodeURIComponent(revision)}`, 'POST', null, token)
export const importLegacyPortfolio = (token: string) => mutate('me/legacy-import', 'POST', null, token)
export const dismissLegacyPortfolioImport = (token: string) => mutate('me/legacy-import/dismiss', 'POST', null, token)
