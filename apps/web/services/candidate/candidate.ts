import { getAPIUrl } from '@services/config/config'

export interface JiraStatus { id: string; name: string; category: string }
export interface JiraColumn { id: string; name: string; status_ids: string[] }
export interface JiraPriority { id: string; name: string }
export interface CandidateAnnouncement { id: string; title: string; message: string; published_at: string }
export interface CandidateAnnouncementFeed { items: CandidateAnnouncement[]; unread: CandidateAnnouncement[] }

export interface CandidateFeedback {
  key: string
  message: string
  status: string
  status_id: string
  status_category: string
  done_at?: string | null
  priority: string
  priority_id: string
  visible_revision: string
  has_unread?: boolean
  submitter?: string | null
  created_at?: string
  updated_at?: string
  entries: Array<{ id: string; message: string; internal: boolean; audience: 'internal' | 'tester' | 'shared'; author: string; created_at?: string }>
  attachments: Array<{ id: string; filename: string; content_type: string; size: number }>
  transitions?: Array<{ id: string; name: string; to: JiraStatus }>
}

export interface CandidateRelease {
  revision: string
  published_at?: string
  title: string
  notes: Array<{ text: string; url?: string; pull_number?: number }>
}

export interface CandidateReleaseFeed {
  current_revision: string
  repository: string
  has_unread: boolean
  unseen: CandidateRelease[]
  previous: CandidateRelease[]
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

async function result<T>(responseOrPromise: Response | Promise<Response>): Promise<T> {
  const response = await responseOrPromise
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body?.detail || 'Something went wrong')
  }
  return response.json()
}

export const candidateConfiguration = (token: string) =>
  result<{ feedback_configured: boolean; revision: string; unstable: boolean; release_channel: string }>(
    fetch(`${getAPIUrl()}candidate/configuration`, { headers: auth(token) })
  )

export const getCandidateFeedback = (orgId: number | undefined, token: string, admin = false) => {
  const query = new URLSearchParams({ admin: String(admin) })
  if (orgId) query.set('org_id', String(orgId))
  return result<CandidateFeedback[]>(fetch(`${getAPIUrl()}candidate/feedback?${query}`, { headers: auth(token) }))
}

export async function submitCandidateFeedback(orgId: number, message: string, images: File[], context: object, token: string) {
  const body = new FormData()
  body.append('org_id', String(orgId))
  body.append('message', message)
  body.append('context', JSON.stringify(context))
  images.forEach((image) => body.append('images', image))
  return result<CandidateFeedback>(fetch(`${getAPIUrl()}candidate/feedback`, { method: 'POST', headers: auth(token), body }))
}

export const updateCandidateFeedback = (
  key: string, update: { status_id?: string; priority_id?: string }, token: string,
) => result<CandidateFeedback>(fetch(`${getAPIUrl()}candidate/feedback/${key}/admin`, {
  method: 'PATCH', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify(update),
}))

export const replyToCandidateFeedback = (key: string, message: string, internal: boolean, token: string) =>
  result<CandidateFeedback>(fetch(`${getAPIUrl()}candidate/feedback/${key}/reply`, {
    method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ message, internal }),
  }))

export const commentOnCandidateFeedback = (orgId: number, key: string, message: string, token: string) =>
  result<CandidateFeedback>(fetch(`${getAPIUrl()}candidate/feedback/${key}/comment?org_id=${orgId}`, {
    method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ message, internal: false }),
  }))

export const markCandidateFeedbackViewed = (orgId: number, token: string) =>
  result<{ seen: number }>(fetch(`${getAPIUrl()}candidate/feedback/viewed?org_id=${orgId}`, { method: 'POST', headers: auth(token) }))

export const getCandidateWorkflow = (token: string) =>
  result<{ columns: JiraColumn[]; priorities: JiraPriority[] }>(fetch(`${getAPIUrl()}candidate/feedback/workflow`, { headers: auth(token) }))

export const getCandidateAnnouncements = (token: string) =>
  result<CandidateAnnouncementFeed>(fetch(`${getAPIUrl()}candidate/announcements`, { headers: auth(token) }))

export const markCandidateAnnouncementsViewed = (ids: string[], token: string) =>
  result<{ seen: string[] }>(fetch(`${getAPIUrl()}candidate/announcements/viewed`, {
    method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify(ids),
  }))

export const createCandidateAnnouncement = (title: string, message: string, token: string) =>
  result<CandidateAnnouncement>(fetch(`${getAPIUrl()}candidate/announcements`, {
    method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ title, message }),
  }))

export const deleteCandidateAnnouncement = (id: string, token: string) =>
  fetch(`${getAPIUrl()}candidate/announcements/${id}`, { method: 'DELETE', headers: auth(token) }).then((response) => {
    if (!response.ok) throw new Error('Could not remove announcement')
  })

export const getCandidateReleases = (token: string) =>
  result<CandidateReleaseFeed>(fetch(`${getAPIUrl()}candidate/releases`, { headers: auth(token) }))

export const markCandidateReleasesViewed = (token: string) =>
  result<{ revision: string }>(fetch(`${getAPIUrl()}candidate/releases/viewed`, { method: 'POST', headers: auth(token) }))

export const candidateAttachmentUrl = (orgId: number | undefined, key: string, attachmentId: string) =>
  `${getAPIUrl()}candidate/feedback/${key}/attachments/${attachmentId}${orgId ? `?org_id=${orgId}` : ''}`
