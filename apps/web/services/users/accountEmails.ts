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
  /** The account's one phone number, which the résumé prints beside the main email (PF-3). */
  phone: string
}

export const accountEmailsKey = () => `${getAPIUrl()}users/me/emails`

const post = async (path: string, body: Record<string, string>, token: string) =>
  errorHandling(await fetch(`${accountEmailsKey()}${path}`, RequestBodyWithAuthHeader('POST', body, null, token)))

const put = async (path: string, body: Record<string, string>, token: string) =>
  errorHandling(await fetch(`${getAPIUrl()}users/me/${path}`, RequestBodyWithAuthHeader('PUT', body, null, token)))

export interface SignInMethods {
  email: { verified: number; total: number }
  password: { set: boolean }
  /** ``available``: Google sign-in is on for this site. */
  google: { available: boolean; connected: boolean; email: string | null }
}

export const signInMethodsKey = () => `${getAPIUrl()}users/me/sign-in-methods`

/** Settings › Account (PF-3): the phone, the username and the ways to sign in. */
export const accountSettingsApi = {
  setPhone: (phone: string, token: string): Promise<{ phone: string }> => put('phone', { phone }, token),
  /** Old links to the profile stop working, and the old username is free for anyone. */
  changeUsername: (username: string, token: string): Promise<{ username: string }> => put('username', { username }, token),
  signInMethods: (token: string): Promise<SignInMethods> => swrFetcher(signInMethodsKey(), token),
  /** Connect the Google account behind a Google access token from the sign-in flow. */
  // From the Google callback the session cookie signs the request, so the token is optional there.
  connectGoogle: async (accessToken: string, token?: string): Promise<SignInMethods> =>
    errorHandling(await fetch(signInMethodsKey() + '/google', RequestBodyWithAuthHeader('POST', { access_token: accessToken }, null, token))),
  disconnectGoogle: async (token: string): Promise<SignInMethods> =>
    errorHandling(await fetch(signInMethodsKey() + '/google', RequestBodyWithAuthHeader('DELETE', null, null, token))),
}

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
