import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

// Activity Document v1: the canonical JSON for one activity, shared by
// single-activity import/export, previews and the Claude connector.
export const ACTIVITY_DOCUMENT_FORMAT = 'launch-lms.activity'

export interface ActivityDocument {
  format: typeof ACTIVITY_DOCUMENT_FORMAT
  format_version: 1
  activity: {
    activity_uuid?: string | null
    title: string
    description?: string
    icon?: string | null
    thumbnail_image?: string
    required?: boolean
    settings?: Record<string, any>
  }
  pages: Array<{
    page_uuid: string
    page_type: 'standard' | 'video'
    title: string
    required?: boolean
    content: Record<string, any>
    design?: Record<string, any>
    scoring?: Record<string, any>
    completion?: Record<string, any>
  }>
}

export interface ActivityDocumentEnvelope {
  document: ActivityDocument
  etag: string
  context: Record<string, any>
  warnings: Array<{ path: string; message: string }>
}

// Build a document from the editor's in-memory activity and pages so previews
// reflect unsaved edits exactly as they are on screen.
export function buildActivityDocument(activity: any, pages: any[]): ActivityDocument {
  const settings = { ...(activity?.settings || {}) }
  delete settings.version_lineage_uuid
  delete settings.system_required
  return {
    format: ACTIVITY_DOCUMENT_FORMAT,
    format_version: 1,
    activity: {
      activity_uuid: activity?.activity_uuid || null,
      title: activity?.title || 'Untitled activity',
      description: activity?.description || '',
      icon: activity?.icon ?? null,
      thumbnail_image: activity?.thumbnail_image || '',
      required: activity?.required ?? true,
      settings,
    },
    pages: (pages || []).map((page: any) => {
      const content = { ...(page?.content || {}) }
      delete content.version_lineage_uuid
      return {
        page_uuid: page.page_uuid,
        page_type: page.page_type === 'video' ? 'video' : 'standard',
        title: page.title || 'Untitled page',
        required: page.required ?? true,
        content,
        design: page.design || {},
        scoring: page.scoring || {},
        completion: page.completion || {},
      }
    }),
  }
}

export async function getActivityDocument(activityUuid: string, accessToken?: string): Promise<ActivityDocumentEnvelope> {
  const result = await fetch(
    `${getAPIUrl()}learning-documents/${activityUuid}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result)
}

export async function saveActivityDocument(activityUuid: string, document: ActivityDocument, baseEtag: string, accessToken?: string): Promise<ActivityDocumentEnvelope> {
  const result = await fetch(
    `${getAPIUrl()}learning-documents/${activityUuid}`,
    RequestBodyWithAuthHeader('PUT', { document, base_etag: baseEtag }, null, accessToken)
  )
  return errorHandling(result)
}

export async function createActivityFromDocument(badgeUuid: string, versionUuid: string | undefined, document: ActivityDocument, accessToken?: string): Promise<ActivityDocumentEnvelope> {
  const result = await fetch(
    `${getAPIUrl()}learning-documents/`,
    RequestBodyWithAuthHeader('POST', { badge_uuid: badgeUuid, version_uuid: versionUuid || null, document }, null, accessToken)
  )
  return errorHandling(result)
}

export async function createLearningPreview(
  payload: { activity_uuid?: string; badge_uuid?: string; document?: ActivityDocument; persona?: Record<string, any>; source?: 'editor' | 'link' | 'connector' },
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

export async function stepLearningPreview(token: string, step: { action: 'submit' | 'complete'; page_uuid: string; answer?: any; state: any }) {
  const result = await fetch(
    `${getAPIUrl()}learning-previews/${encodeURIComponent(token)}/steps`,
    RequestBodyWithAuthHeader('POST', step, null)
  )
  return errorHandling(result)
}
