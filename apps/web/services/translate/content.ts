import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type ContentTranslations = { language: string; available: boolean; partial: boolean; translations: Record<string, string> }

/** Organization and outside text in a language, translated once on the server and kept. */
export async function translateContent(language: string, texts: string[], access_token: string): Promise<ContentTranslations> {
  const result = await fetch(`${getAPIUrl()}translate`, RequestBodyWithAuthHeader('POST', { language, texts }, null, access_token))
  return errorHandling(result)
}
