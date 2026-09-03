import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type HubAdvisorConfiguration = {
  provider: 'openai'
  enabled: boolean
  model: string
  instructions: string
  api_key_configured: boolean
  updated_at?: string | null
  updated_by_user_id?: number | null
}

export type HubAdvisorConfigurationUpdate = {
  enabled: boolean
  model: string
  instructions: string
  api_key?: string
  clear_api_key?: boolean
}

async function request(token?: string, method = 'GET', body: unknown = null) {
  const response = await fetch(
    `${getAPIUrl()}superadmin/settings/hub-advisor`,
    RequestBodyWithAuthHeader(method, body, null, token)
  )
  return errorHandling(response) as Promise<HubAdvisorConfiguration>
}

export const hubAdvisorConfigurationApi = {
  get: (token?: string) => request(token),
  update: (payload: HubAdvisorConfigurationUpdate, token?: string) => request(token, 'PUT', payload),
}
