import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

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

/** Answering an invitation card in a chat; the card's inbox_uuid names the message. */
export const messagesApi = {
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
