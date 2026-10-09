import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export interface OAuthAuthorizationParams {
  client_id: string
  redirect_uri: string
  code_challenge: string
  code_challenge_method: string
  response_type: string
  scope?: string | null
  state?: string | null
  resource?: string | null
}

// OAuth endpoints answer with RFC 6749 `{error, error_description}` bodies.
async function oauthResult(result: Response) {
  const body = await result.json().catch(() => ({}))
  if (!result.ok) {
    const error: any = new Error(body.error_description || body.detail || 'The request could not be completed.')
    error.code = body.error
    error.status = result.status
    throw error
  }
  return body
}

export async function validateOAuthAuthorization(params: OAuthAuthorizationParams, accessToken?: string) {
  const result = await fetch(`${getAPIUrl()}oauth/authorize/validate`, RequestBodyWithAuthHeader('POST', params, null, accessToken))
  return oauthResult(result)
}

export async function decideOAuthAuthorization(
  params: OAuthAuthorizationParams & { approve: boolean; org_id?: number | null },
  accessToken?: string
): Promise<{ redirect_to: string }> {
  const result = await fetch(`${getAPIUrl()}oauth/authorize/decision`, RequestBodyWithAuthHeader('POST', params, null, accessToken))
  return oauthResult(result)
}

export async function listOAuthConnections(accessToken?: string) {
  const result = await fetch(`${getAPIUrl()}oauth/connections`, RequestBodyWithAuthHeader('GET', null, null, accessToken))
  return errorHandling(result)
}

export async function disconnectOAuthConnection(connectionId: string, accessToken?: string) {
  const result = await fetch(`${getAPIUrl()}oauth/connections/${encodeURIComponent(connectionId)}`, RequestBodyWithAuthHeader('DELETE', null, null, accessToken))
  return errorHandling(result)
}
