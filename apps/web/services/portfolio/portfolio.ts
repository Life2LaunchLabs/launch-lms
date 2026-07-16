import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export async function getMyPortfolio(token: string, preview = false) {
  const response = await fetch(`${getAPIUrl()}portfolio/me${preview ? '/preview' : ''}`, RequestBodyWithAuthHeader('GET', null, { revalidate: 0 }, token))
  return errorHandling(response)
}

export async function getPublicPortfolio(orgId: number, username: string) {
  const response = await fetch(`${getAPIUrl()}public/portfolio/${orgId}/${encodeURIComponent(username)}`, { cache: 'no-store' })
  return errorHandling(response)
}

export async function getPublicPortfolioWork(orgId: number, username: string, slug: string) {
  const response = await fetch(`${getAPIUrl()}public/portfolio/${orgId}/${encodeURIComponent(username)}/work/${encodeURIComponent(slug)}`, { cache: 'no-store' })
  return errorHandling(response)
}

export async function getPublicPortfolioJourney(orgId: number, username: string, slug: string) {
  const response = await fetch(`${getAPIUrl()}public/portfolio/${orgId}/${encodeURIComponent(username)}/journey/${encodeURIComponent(slug)}`, { cache: 'no-store' })
  return errorHandling(response)
}

async function mutate(path: string, method: string, payload: unknown, token: string) {
  const response = await fetch(`${getAPIUrl()}portfolio/${path}`, RequestBodyWithAuthHeader(method, payload, null, token))
  return errorHandling(response)
}

export const updateMyPortfolio = (payload: unknown, token: string) => mutate('me', 'PATCH', payload, token)
export const updateMyPortfolioTraits = (payload: { trait_type: 'strength' | 'value'; labels: string[] }, token: string) => mutate('me/traits', 'PUT', payload, token)
export const createPortfolioWork = (payload: unknown, token: string) => mutate('me/work', 'POST', payload, token)
export const updatePortfolioWork = (uuid: string, payload: unknown, token: string) => mutate(`me/work/${uuid}`, 'PATCH', payload, token)
export const createPortfolioJourney = (payload: unknown, token: string) => mutate('me/journey', 'POST', payload, token)
export const updatePortfolioJourney = (uuid: string, payload: unknown, token: string) => mutate(`me/journey/${uuid}`, 'PATCH', payload, token)
export const publishMyPortfolio = (payload: unknown, token: string) => mutate('me/publish', 'POST', payload, token)
export const importLegacyPortfolio = (token: string) => mutate('me/legacy-import', 'POST', null, token)
