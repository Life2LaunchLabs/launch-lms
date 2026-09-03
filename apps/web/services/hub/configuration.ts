import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type HubAdvisorConfiguration = {
  provider: HubAdvisorProvider
  enabled: boolean
  instructions: string
  provider_configurations: Record<HubAdvisorProvider, HubAdvisorProviderConfiguration>
  updated_at?: string | null
  updated_by_user_id?: number | null
}

export type HubAdvisorProvider = 'openai' | 'anthropic'

export type HubAdvisorAdvancedConfiguration = {
  max_output_tokens: number
  reasoning_effort: 'default' | 'none' | 'low' | 'medium' | 'high' | 'xhigh'
  verbosity: 'default' | 'low' | 'medium' | 'high'
  thinking_effort: 'default' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

export type HubAdvisorProviderConfiguration = {
  model: string
  api_key_configured: boolean
  advanced: HubAdvisorAdvancedConfiguration
}

export type HubAdvisorModel = {
  id: string
  name: string
  description: string
  available: boolean | null
}

export type HubAdvisorModelCatalog = {
  provider: HubAdvisorProvider
  source: 'curated' | 'live'
  models: HubAdvisorModel[]
}

export type HubAdvisorConfigurationUpdate = {
  provider: HubAdvisorProvider
  enabled: boolean
  model: string
  instructions: string
  advanced: HubAdvisorAdvancedConfiguration
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
  models: async (provider: HubAdvisorProvider, token?: string) => {
    const response = await fetch(
      `${getAPIUrl()}superadmin/settings/hub-advisor/models?provider=${provider}`,
      RequestBodyWithAuthHeader('GET', null, null, token)
    )
    return errorHandling(response) as Promise<HubAdvisorModelCatalog>
  },
}
