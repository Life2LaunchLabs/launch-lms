import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

async function request(path: string, token?: string, method = 'GET', body: any = null) {
  const response = await fetch(`${getAPIUrl()}badges/${path}`, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

const clean = (badgeUuid: string) => encodeURIComponent(badgeUuid)

/** The ways to earn a badge (goal templates), who offers them, and the learner's goal if started. */
export const badgeRoutesApi = {
  list: (badgeUuid: string, token?: string) => request(`${clean(badgeUuid)}/routes`, token),
  set: (badgeUuid: string, routes: { template_uuid: string; recommended: boolean }[], token?: string) => request(`${clean(badgeUuid)}/routes`, token, 'PUT', { routes }),
  setOffers: (badgeUuid: string, issuerOrgId: number, routeUuids: string[], token?: string) => request(`${clean(badgeUuid)}/routes/offers?issuer_org_id=${issuerOrgId}`, token, 'PUT', { route_uuids: routeUuids }),
  /** The badge's owner says which versions of a route's template earn it. */
  setEligibility: (badgeUuid: string, routeUuid: string, rule: 'any' | 'latest' | 'from', fromVersion: number | null, token?: string) =>
    request(`${clean(badgeUuid)}/routes/${encodeURIComponent(routeUuid)}/eligibility`, token, 'PUT', { rule, from_version: rule === 'from' ? fromVersion : null }),
  start: (badgeUuid: string, data: { template_uuid?: string; issuer_org_id?: number }, token?: string): Promise<{ goal_uuid: string; title: string; status: string; done: number; total: number }> => request(`${clean(badgeUuid)}/start-plan`, token, 'POST', data),
}
