import { getAPIUrl } from '@services/config/config'

export type FeedbackStatus = 'open' | 'in_progress' | 'awaiting_confirmation' | 'solved' | 'ignored'

export interface CandidateFeedback {
  key: string
  message: string
  status: FeedbackStatus
  priority: 'normal' | 'high'
  fixed_in_revision?: string | null
  submitter?: string | null
  created_at?: string
  updated_at?: string
  entries: Array<{ id: string; message: string; internal: boolean; author: string; created_at?: string }>
  attachments: Array<{ id: string; filename: string; content_type: string; size: number }>
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

export const getCandidateFeedback = (orgId: number, token: string, admin = false) =>
  result<CandidateFeedback[]>(fetch(`${getAPIUrl()}candidate/feedback?org_id=${orgId}&admin=${admin}`, { headers: auth(token) }))

export async function submitCandidateFeedback(orgId: number, message: string, images: File[], token: string) {
  const body = new FormData()
  body.append('org_id', String(orgId))
  body.append('message', message)
  images.forEach((image) => body.append('images', image))
  return result<CandidateFeedback>(fetch(`${getAPIUrl()}candidate/feedback`, { method: 'POST', headers: auth(token), body }))
}

export const editCandidateFeedback = (orgId: number, key: string, message: string, token: string) =>
  result<CandidateFeedback>(fetch(`${getAPIUrl()}candidate/feedback/${key}?org_id=${orgId}`, {
    method: 'PATCH', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ message }),
  }))

export const updateCandidateFeedback = (
  orgId: number, key: string, update: { status?: FeedbackStatus; priority?: 'normal' | 'high'; release_note?: string }, token: string,
) => result<CandidateFeedback>(fetch(`${getAPIUrl()}candidate/feedback/${key}/admin?org_id=${orgId}`, {
  method: 'PATCH', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify(update),
}))

export const replyToCandidateFeedback = (orgId: number, key: string, message: string, internal: boolean, token: string) =>
  result<CandidateFeedback>(fetch(`${getAPIUrl()}candidate/feedback/${key}/reply?org_id=${orgId}`, {
    method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ message, internal }),
  }))

export const confirmCandidateFeedback = (orgId: number, key: string, solved: boolean, token: string) =>
  result<CandidateFeedback>(fetch(`${getAPIUrl()}candidate/feedback/${key}/confirm?org_id=${orgId}`, {
    method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ solved }),
  }))

export const getCandidateReleases = (token: string) =>
  result<CandidateReleaseFeed>(fetch(`${getAPIUrl()}candidate/releases`, { headers: auth(token) }))

export const markCandidateReleasesViewed = (token: string) =>
  result<{ revision: string }>(fetch(`${getAPIUrl()}candidate/releases/viewed`, { method: 'POST', headers: auth(token) }))

export const candidateAttachmentUrl = (orgId: number, key: string, attachmentId: string) =>
  `${getAPIUrl()}candidate/feedback/${key}/attachments/${attachmentId}?org_id=${orgId}`
