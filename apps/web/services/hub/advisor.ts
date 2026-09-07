import { getAPIUrl } from '@services/config/config'
import type { ResourceType } from '@services/resources/resources'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type HubAdvisorResource = {
  resource_uuid: string
  title: string
  description: string | null
  resource_type: ResourceType
  provider_name: string | null
  cover_image_url: string | null
  thumbnail_image: string | null
  owner_org_uuid: string | null
  access_mode: string
  tags: string[]
}

export type HubAdvisorMessage = {
  role: 'user' | 'assistant'
  content: string
  resources?: HubAdvisorResource[]
}

export async function askHubAdvisor(
  orgId: number,
  messages: HubAdvisorMessage[],
  accessToken: string
): Promise<{
  answer: string
  usage: { input_tokens: number; output_tokens: number }
  resources: HubAdvisorResource[]
}> {
  const response = await fetch(
    `${getAPIUrl()}hub/advisor?org_id=${encodeURIComponent(orgId)}`,
    RequestBodyWithAuthHeader(
      'POST',
      { messages: messages.map(({ role, content }) => ({ role, content })) },
      null,
      accessToken
    )
  )
  return errorHandling(response)
}
