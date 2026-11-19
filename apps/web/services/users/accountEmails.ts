import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling, swrFetcher } from '@services/utils/ts/requests'

/** An email on your account other than the main one. ``source`` is how it got there: a code, Canvas, or an old main. */
export interface SpareEmail {
  email: string
  source: 'code' | 'canvas' | 'main' | string
  verified_at: string | null
}

export interface AccountEmails {
  main: { email: string; verified: boolean }
  spares: SpareEmail[]
  max_spares: number
  /** A school or work address is your only one: ask for a personal one (dismissable). */
  ask_for_personal: boolean
}

export const accountEmailsKey = () => `${getAPIUrl()}users/me/emails`

const post = async (path: string, body: Record<string, string>, token: string) =>
  errorHandling(await fetch(`${accountEmailsKey()}${path}`, RequestBodyWithAuthHeader('POST', body, null, token)))

export const accountEmailsApi = {
  get: (token: string): Promise<AccountEmails> => swrFetcher(accountEmailsKey(), token),
  /** Send a six-digit code to the email. Refused when the email is on another account. */
  sendCode: (email: string, token: string): Promise<{ email: string; expires_in: number }> => post('', { email }, token),
  confirm: (email: string, code: string, token: string): Promise<AccountEmails> => post('/confirm', { email, code }, token),
  /** Make a spare the main email. Your sign-in moves to it, so the session needs refreshing after. */
  makeMain: (email: string, token: string): Promise<AccountEmails> => post('/main', { email }, token),
  remove: (email: string, token: string): Promise<AccountEmails> => post('/remove', { email }, token),
  dismissPrompt: (token: string): Promise<AccountEmails> => post('/personal-prompt/dismiss', {}, token),
}
