import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

// The page templates plan (one system plan in the platform's owner organization): its live
// version's pages by category, Add question's default for each pick, and whether you may edit it.

export const PAGE_TEMPLATES_SYSTEM_TYPE = 'page_templates'
export const PAGE_TEMPLATES_KEY = 'learning-page-templates'

export type ServedPage = { page_uuid: string; page_type: 'standard' | 'video'; title: string; content: any; design: any }
export type ServedPageTemplates = {
  categories: Array<{ name: string; pages: ServedPage[] }>
  defaults: Partial<Record<'quick_check' | 'pick_few' | 'short_answer' | 'show_work', ServedPage>>
  template_uuid: string | null
  can_edit: boolean
}

export async function getPageTemplates(accessToken?: string): Promise<ServedPageTemplates> {
  const result = await fetch(`${getAPIUrl()}learning-pages/templates`, RequestBodyWithAuthHeader('GET', null, null, accessToken))
  return errorHandling(result)
}
