import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

async function request(path: string, token?: string, method = 'GET', body: any = null) {
  const response = await fetch(`${getAPIUrl()}badges/${path}`, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

const clean = (badgeUuid: string) => encodeURIComponent(badgeUuid)

/** The ways to earn a badge (plan templates), who offers them, and the learner's plan if started. */
export const badgeRoutesApi = {
  list: (badgeUuid: string, token?: string) => request(`${clean(badgeUuid)}/routes`, token),
  set: (badgeUuid: string, routes: { program_uuid: string; recommended: boolean }[], token?: string) => request(`${clean(badgeUuid)}/routes`, token, 'PUT', { routes }),
  setOffers: (badgeUuid: string, issuerOrgId: number, routeUuids: string[], token?: string) => request(`${clean(badgeUuid)}/routes/offers?issuer_org_id=${issuerOrgId}`, token, 'PUT', { route_uuids: routeUuids }),
  convertPath: (badgeUuid: string, token?: string) => request(`${clean(badgeUuid)}/routes/convert-path`, token, 'POST'),
  start: (badgeUuid: string, data: { program_uuid?: string; issuer_org_id?: number }, token?: string) => request(`${clean(badgeUuid)}/start-plan`, token, 'POST', data),
}
