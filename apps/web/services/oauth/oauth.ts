import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader } from '@services/utils/ts/requests'
import { oauthErrorCode, oauthErrorMessage } from '@services/oauth/errors'

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

// OAuth endpoints answer with RFC 6749 `{error, error_description}` bodies;
// app-level checks answer with `{detail}` (see errors.ts).
async function oauthResult(result: Response) {
  const body = await result.json().catch(() => ({}))
  if (!result.ok) {
    const error: any = new Error(oauthErrorMessage(body))
    error.code = oauthErrorCode(body)
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


export interface ConnectorInfo {
  enabled: boolean
  /** The address to paste into Claude as a custom connector. */
  server_url: string
  /** What Claude can do, in plain words; lines this person can't use are left out. */
  abilities: string[]
}

export interface AppConnection {
  connection_id: string
  client_name: string
  org_id: number
  scope: string
  last_used_at: string | null
}

export async function getConnectorInfo(accessToken?: string): Promise<ConnectorInfo> {
  const result = await fetch(`${getAPIUrl()}oauth/connector`, RequestBodyWithAuthHeader('GET', null, null, accessToken))
  return oauthResult(result)
}

export async function listAppConnections(accessToken?: string): Promise<AppConnection[]> {
  const result = await fetch(`${getAPIUrl()}oauth/connections`, RequestBodyWithAuthHeader('GET', null, null, accessToken))
  return oauthResult(result)
}

export async function disconnectApp(connectionId: string, accessToken?: string) {
  const result = await fetch(`${getAPIUrl()}oauth/connections/${encodeURIComponent(connectionId)}`, RequestBodyWithAuthHeader('DELETE', null, null, accessToken))
  return oauthResult(result)
}
