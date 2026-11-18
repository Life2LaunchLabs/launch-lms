import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader } from '@services/utils/ts/requests'

/** What the school's Canvas admin needs to add Life2Launch (API: src/services/canvas/settings.py). */
export interface CanvasToolDetails {
  config_url: string
  login_url: string
  launch_url: string
  redirect_uri: string
  jwks_url: string
}

export interface CanvasConnection {
  canvas_host: string
  client_id: string
  deployment_ids: string[]
  issuer: string
  enabled: boolean
  ages_confirmed: boolean
  ages_confirmed_at: string | null
  update_date: string
}

export interface CanvasSettings {
  connection: CanvasConnection | null
  tool: CanvasToolDetails
}

export interface CanvasSettingsUpdate {
  canvas_host: string
  client_id: string
  deployment_ids: string
  issuer?: string | null
  enabled: boolean
  ages_confirmed: boolean
}

async function result(response: Response): Promise<CanvasSettings> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = typeof body?.detail === 'string' ? body.detail : 'That didn’t save. Try again in a moment.'
    throw new Error(detail)
  }
  return body
}

export async function getCanvasSettings(orgId: number, accessToken?: string): Promise<CanvasSettings> {
  return result(await fetch(`${getAPIUrl()}lti/orgs/${orgId}/connection`, RequestBodyWithAuthHeader('GET', null, null, accessToken)))
}

export async function saveCanvasSettings(orgId: number, body: CanvasSettingsUpdate, accessToken?: string): Promise<CanvasSettings> {
  return result(await fetch(`${getAPIUrl()}lti/orgs/${orgId}/connection`, RequestBodyWithAuthHeader('PUT', body, null, accessToken)))
}
