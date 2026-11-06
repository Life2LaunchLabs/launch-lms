import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling, swrFetcher } from '@services/utils/ts/requests'

/** How much the app reads aloud and how it looks, saved on the learner's account. */
export interface AccessibilitySettings {
  read_to_me: boolean
  voice: string | null
  rate: number
  highlight: boolean
  bigger_text: boolean
  less_motion: 'device' | 'on' | 'off'
  /** Who last changed them for the learner, when it was someone assisting them. */
  set_by?: { user_id: number; name: string; at: string } | null
}

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  read_to_me: false, voice: null, rate: 1, highlight: true, bigger_text: false, less_motion: 'device', set_by: null,
}

export const accessibilityKeys = {
  mine: () => `${getAPIUrl()}users/me/accessibility`,
  learner: (orgId: number, userId: number) => `${getAPIUrl()}orgs/${orgId}/users/${userId}/accessibility`,
}

const strip = ({ set_by: _setBy, ...settings }: AccessibilitySettings) => settings // eslint-disable-line no-unused-vars

async function put(url: string, settings: AccessibilitySettings, token: string): Promise<AccessibilitySettings> {
  return errorHandling(await fetch(url, RequestBodyWithAuthHeader('PUT', strip(settings), null, token)))
}

export const accessibilityApi = {
  mine: (token: string): Promise<AccessibilitySettings> => swrFetcher(accessibilityKeys.mine(), token),
  saveMine: (settings: AccessibilitySettings, token: string) => put(accessibilityKeys.mine(), settings, token),
  learner: (orgId: number, userId: number, token: string): Promise<AccessibilitySettings> => swrFetcher(accessibilityKeys.learner(orgId, userId), token),
  saveLearner: (orgId: number, userId: number, settings: AccessibilitySettings, token: string) => put(accessibilityKeys.learner(orgId, userId), settings, token),
}
