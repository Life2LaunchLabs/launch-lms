import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type InboxMessage = {
  message_uuid: string
  message_type: string
  subject: string
  body: string
  action_url?: string | null
  action_kind?: 'organization_invitation' | 'plan_invitation' | string | null
  action_data?: Record<string, unknown> | null
  action_status?: 'pending' | 'accepted' | 'declined' | null
  unread: boolean
  read_at?: string | null
  resolved_at?: string | null
  created_at: string
  sender_organization?: {
    id: number
    org_uuid: string
    name: string
    slug: string
    logo_image?: string | null
  } | null
}

export type WelcomeMessageTemplate = {
  template_key: string
  subject: string
  body: string
  customized: boolean
  updated_at?: string | null
  updated_by_user_id?: number | null
}

async function request(path: string, token?: string, method = 'GET', body: unknown = null) {
  const response = await fetch(`${getAPIUrl()}messages${path}`, RequestBodyWithAuthHeader(method, body, null, token))
  return errorHandling(response)
}

export const messagesApi = {
  list: (token?: string) => request('/me', token) as Promise<InboxMessage[]>,
  markViewed: (token?: string) => request('/me/viewed', token, 'POST'),
  respond: (messageUuid: string, accept: boolean, token?: string) => request(`/me/${encodeURIComponent(messageUuid)}/respond`, token, 'POST', { accept }),
}

async function platformTemplateRequest(token?: string, method = 'GET', body: unknown = null) {
  const response = await fetch(
    `${getAPIUrl()}superadmin/settings/welcome-message`,
    RequestBodyWithAuthHeader(method, body, null, token)
  )
  return errorHandling(response) as Promise<WelcomeMessageTemplate>
}

export const welcomeMessageTemplateApi = {
  get: (token?: string) => platformTemplateRequest(token),
  update: (subject: string, body: string, token?: string) => platformTemplateRequest(token, 'PUT', { subject, body }),
  reset: (token?: string) => platformTemplateRequest(token, 'DELETE', {}),
}
