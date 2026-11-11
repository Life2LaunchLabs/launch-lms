import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling, swrFetcher } from '@services/utils/ts/requests'

/** One kind of email the app can send you, and whether you get it. */
export interface EmailStream {
  key: string
  label: string
  description: string
  enabled: boolean
}

export interface EmailNotifications {
  streams: EmailStream[]
}

export const emailNotificationsKey = () => `${getAPIUrl()}users/me/email_notifications`

export const emailNotificationsApi = {
  get: (token: string): Promise<EmailNotifications> => swrFetcher(emailNotificationsKey(), token),
  save: async (changes: Record<string, boolean>, token: string): Promise<EmailNotifications> =>
    errorHandling(await fetch(emailNotificationsKey(), RequestBodyWithAuthHeader('PUT', changes, null, token))),
}
