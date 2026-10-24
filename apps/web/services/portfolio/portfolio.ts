import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export async function getMyPortfolio(token: string, preview = false) {
  const response = await fetch(`${getAPIUrl()}portfolio/me${preview ? '/preview' : ''}`, RequestBodyWithAuthHeader('GET', null, { revalidate: 0 }, token))
  return normalizeTimelineProjects(await errorHandling(response))
}

/**
 * Someone's portfolio. Signed in, it's fetched as the viewer: people they added see it even while
 * it's private, and the shell says what they can do (``access``). Signed out, only a published one.
 */
export async function getPublicPortfolio(orgId: number, username: string, token?: string | null) {
  const shared = token ? await fetch(`${getAPIUrl()}portfolio/shared/${orgId}/${encodeURIComponent(username)}`, RequestBodyWithAuthHeader('GET', null, { revalidate: 0 }, token)) : null
  // A stale sign-in still shows what everyone can see.
  const response = shared && shared.status !== 401 ? shared : await fetch(`${getAPIUrl()}public/portfolio/${orgId}/${encodeURIComponent(username)}`, { cache: 'no-store' })
  return normalizeTimelineProjects(await errorHandling(response))
}

function normalizeTimelineProjects<T extends { timeline?: Array<Record<string, any>> | Record<string, any> }>(shell: T): T {
  if (Array.isArray(shell?.timeline)) return { ...shell, timeline: shell.timeline.map((entry) => ({ ...entry, projects: entry.projects || [], project: entry.projects || [] })) }
  if (shell?.timeline && typeof shell.timeline === 'object') return { ...shell, timeline: { ...shell.timeline, projects: shell.timeline.projects || [], project: shell.timeline.projects || [] } }
  return shell
}

export async function getPublicPortfolioProject(orgId: number, username: string, slug: string, token?: string | null) {
  if (token) {
    const shell = await getPublicPortfolio(orgId, username, token)
    const project = shell.projects?.find((item: any) => item.slug === slug)
    if (!project) throw new Error('Project item not found')
    return { portfolio: shell.portfolio, project }
  }
  const response = await fetch(`${getAPIUrl()}public/portfolio/${orgId}/${encodeURIComponent(username)}/projects/${encodeURIComponent(slug)}`, { cache: 'no-store' })
  return errorHandling(response)
}

export async function getPublicPortfolioTimeline(orgId: number, username: string, slug: string, token?: string | null) {
  if (token) {
    const shell = await getPublicPortfolio(orgId, username, token)
    const timeline = shell.timeline?.find((item: any) => item.slug === slug)
    if (!timeline) throw new Error('Timeline experience not found')
    return { portfolio: shell.portfolio, timeline }
  }
  const response = await fetch(`${getAPIUrl()}public/portfolio/${orgId}/${encodeURIComponent(username)}/timeline/${encodeURIComponent(slug)}`, { cache: 'no-store' })
  return normalizeTimelineProjects(await errorHandling(response))
}

async function mutate(path: string, method: string, payload: unknown, token: string) {
  const response = await fetch(`${getAPIUrl()}portfolio/${path}`, RequestBodyWithAuthHeader(method, payload, null, token))
  return errorHandling(response)
}

export const updateMyPortfolio = (payload: unknown, token: string) => mutate('me', 'PATCH', payload, token)
export const updateMyPortfolioTraits = (payload: { trait_type: 'strength' | 'value'; labels: string[] }, token: string) => mutate('me/traits', 'PUT', payload, token)
export const updateMyPortfolioFeaturedBadges = (payload: { award_uuids: string[] }, token: string) => mutate('me/featured-badges', 'PUT', payload, token)
export const updateMyPortfolioFeaturedProject = (payload: { project_uuid?: string | null; project_uuids?: string[] }, token: string) => mutate('me/featured-projects', 'PUT', payload, token)
export const updateMyPortfolioFeaturedTimeline = (payload: { timeline_uuids: string[] }, token: string) => mutate('me/featured-timeline', 'PUT', payload, token)
export const updateMyPortfolioBadgeVisibility = (payload: { hidden_award_uuids: string[]; revision: number }, token: string) => mutate('me/badge-visibility', 'PUT', payload, token)
export const updateMyPortfolioSections = (payload: { sections: Array<{ section_uuid: string; enabled: boolean }>; revision: number }, token: string) => mutate('me/sections', 'PUT', payload, token)
export const createPortfolioProject = (payload: unknown, token: string) => mutate('me/projects', 'POST', payload, token)
export const updatePortfolioProject = (uuid: string, payload: unknown, token: string) => mutate(`me/projects/${uuid}`, 'PATCH', payload, token)
export const createPortfolioTimeline = (payload: unknown, token: string) => mutate('me/timeline', 'POST', payload, token)
export const updatePortfolioTimeline = (uuid: string, payload: unknown, token: string) => mutate(`me/timeline/${uuid}`, 'PATCH', payload, token)
export const publishMyPortfolio = (payload: unknown, token: string) => mutate('me/publish', 'POST', payload, token)
export const unpublishMyPortfolio = (revision: number, token: string) => mutate(`me/unpublish?revision=${encodeURIComponent(revision)}`, 'POST', null, token)
export const importLegacyPortfolio = (token: string) => mutate('me/legacy-import', 'POST', null, token)
export const dismissLegacyPortfolioImport = (token: string) => mutate('me/legacy-import/dismiss', 'POST', null, token)

const sameOriginJson = (path: string, body: unknown) => fetch(path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** Asks for another verification email; the reply says if the address is already verified. */
export async function resendVerificationEmail(email: string): Promise<{ verified?: boolean } | null> {
  const response = await sameOriginJson('/api/auth/resend-verification', { email })
  if (!response.ok) throw new Error('Could not resend verification email')
  return response.json().catch(() => null)
}

/** Changes the signed-in learner's email, then sends a verification email to the new address. */
export async function changeEmailAndVerify(email: string) {
  const changed = await sameOriginJson('/api/auth/change-email', { email })
  const data = await changed.json().catch(() => null)
  if (!changed.ok) throw new Error(data?.detail || 'Could not change email')
  await sameOriginJson('/api/auth/resend-verification', { email })
}

/** Recent posts and profile details for a social account shown on a portfolio. */
export async function getSocialPreviews(site: 'instagram' | 'youtube', handle: string): Promise<{ items?: any[]; profile?: any }> {
  const response = await fetch(`/api/portfolio/social-previews?site=${site}&handle=${encodeURIComponent(handle)}`)
  return response.ok ? response.json() : { items: [] }
}
