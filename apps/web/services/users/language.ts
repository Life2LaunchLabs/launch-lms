import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type SavedLanguage = { language: string | null; supported: string[] }

/** Save the person's language on their account; null clears it so the browser's language applies. */
export async function saveMyLanguage(language: string | null, access_token: string): Promise<SavedLanguage> {
  const result = await fetch(
    `${getAPIUrl()}users/me/language`,
    RequestBodyWithAuthHeader('PUT', { language }, null, access_token)
  )
  return errorHandling(result)
}
