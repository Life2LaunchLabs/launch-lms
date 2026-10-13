import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

// Activity Document v1: the canonical JSON for one activity, shared by
// previews and the Claude connector.
const ACTIVITY_DOCUMENT_FORMAT = 'launch-lms.activity'

interface ActivityDocument {
  format: typeof ACTIVITY_DOCUMENT_FORMAT
  format_version: 1
  activity: {
    activity_uuid?: string | null
    title: string
    description?: string
    icon?: string | null
    thumbnail_image?: string
    settings?: Record<string, any>
  }
  pages: Array<{
    page_uuid: string
    page_type: 'standard' | 'video'
    title: string
    required?: boolean
    content: Record<string, any>
    design?: Record<string, any>
  }>
}

// Build a document from the editor's in-memory activity and pages so previews
// reflect unsaved edits exactly as they are on screen.
export function buildActivityDocument(activity: any, pages: any[]): ActivityDocument {
  return {
    format: ACTIVITY_DOCUMENT_FORMAT,
    format_version: 1,
    activity: {
      activity_uuid: activity?.activity_uuid || null,
      title: activity?.title || 'Untitled activity',
      description: activity?.description || '',
      icon: activity?.icon ?? null,
      thumbnail_image: activity?.thumbnail_image || '',
      settings: activity?.settings || {},
    },
    pages: (pages || []).map((page: any) => ({
      page_uuid: page.page_uuid,
      page_type: page.page_type === 'video' ? 'video' : 'standard',
      title: page.title || 'Untitled page',
      required: page.required ?? true,
      content: page.content || {},
      design: page.design || {},
    })),
  }
}

export async function createLearningPreview(
  payload: { activity_uuid?: string; template_uuid?: string; document?: ActivityDocument; persona?: Record<string, any>; source?: 'editor' | 'link' | 'connector' },
  accessToken?: string
): Promise<{ token: string; url: string; expires_at: string; warnings: any[] }> {
  const result = await fetch(
    `${getAPIUrl()}learning-previews/`,
    RequestBodyWithAuthHeader('POST', payload, null, accessToken)
  )
  return errorHandling(result)
}

export async function getLearningPreview(token: string) {
  const result = await fetch(
    `${getAPIUrl()}learning-previews/${encodeURIComponent(token)}`,
    RequestBodyWithAuthHeader('GET', null, null)
  )
  return errorHandling(result)
}

export async function stepLearningPreview(token: string, step: { action: 'submit' | 'complete'; page_uuid: string; answer?: any; button?: string; state: any }) {
  const result = await fetch(
    `${getAPIUrl()}learning-previews/${encodeURIComponent(token)}/steps`,
    RequestBodyWithAuthHeader('POST', step, null)
  )
  return errorHandling(result)
}

// Stored content that predates the current content models. It still works for
// learners and can still be saved; edits just cannot add new issues.
export interface ActivityContentIssues { pages: Record<string, string[]>; flow: string[] }

export async function getActivityContentIssues(activityUuid: string, accessToken?: string): Promise<ActivityContentIssues> {
  const result = await fetch(`${getAPIUrl()}learning-content/activities/${activityUuid}/issues`, RequestBodyWithAuthHeader('GET', null, null, accessToken))
  return errorHandling(result)
}

// apply=false lists the mechanical fixes for review; apply=true saves them (drafts only).
export async function repairActivityContent(activityUuid: string, apply: boolean, accessToken?: string): Promise<{ changes: { pages: Record<string, string[]>; flow: string[] }; remaining: ActivityContentIssues; activity?: any }> {
  const result = await fetch(`${getAPIUrl()}learning-content/activities/${activityUuid}/repair`, RequestBodyWithAuthHeader('POST', { apply }, null, accessToken))
  return errorHandling(result)
}
