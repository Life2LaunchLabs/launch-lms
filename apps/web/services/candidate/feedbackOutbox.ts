/**
 * Feedback that hasn't reached the server yet, kept in this browser (IndexedDB) so it's never lost offline,
 * plus the last list the server sent, so the panel opens instantly. Sending is retried when the connection
 * comes back; each submission carries its own id, so a retry never files it twice.
 */
import { type CandidateFeedback, type CandidateFeedbackIntent, submitCandidateFeedback } from './candidate'

export interface QueuedFeedback {
  id: string
  orgId: number
  message: string
  intent: CandidateFeedbackIntent | null
  context: object
  images: Blob[]
  createdAt: string
  /** Set when the server turned it down (not a connection problem), so it isn't retried. */
  error?: string
}

const DB_NAME = 'launchlms-feedback'
const STORE = 'outbox'
const LIST_KEY = (orgId: number) => `launchlms-feedback-list:${orgId}`

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: 'id' }) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// eslint-disable-next-line no-unused-vars
async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

export const newSubmissionId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

export async function queueFeedback(item: QueuedFeedback): Promise<void> {
  try { await withStore('readwrite', (store) => store.put(item)) } catch { /* private mode: it's still sent right away */ }
}

export async function queuedFeedback(orgId: number): Promise<QueuedFeedback[]> {
  try { return ((await withStore('readonly', (store) => store.getAll())) as QueuedFeedback[]).filter((item) => item.orgId === orgId) } catch { return [] }
}

async function dropQueued(id: string): Promise<void> {
  try { await withStore('readwrite', (store) => store.delete(id)) } catch { /* nothing to drop */ }
}

/** How a queued submission shows in the list until the server has it. */
export function queuedItem(item: QueuedFeedback): CandidateFeedback {
  return {
    key: `queued-${item.id}`, message: item.message, status: item.error ? 'Not sent' : 'Waiting to send', status_id: '', status_category: 'new',
    priority: 'Medium', priority_id: '', visible_revision: '', intent: item.intent, created_at: item.createdAt, updated_at: item.createdAt,
    entries: [], attachments: [], queued: true, pending_attachments: item.images.length,
  }
}

const isConnectionProblem = (error: unknown) => error instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine)

/**
 * Sends one submission, keeping it in the browser if the connection drops. Resolves with what the server
 * saved, or null when it's still waiting for a connection.
 */
export async function sendFeedback(item: QueuedFeedback, token: string): Promise<CandidateFeedback | null> {
  await queueFeedback(item)
  try {
    const saved = await submitCandidateFeedback(item.orgId, item.message, item.images, item.context, token, item.intent, item.id)
    await dropQueued(item.id)
    return saved
  } catch (error) {
    if (isConnectionProblem(error)) return null
    const message = error instanceof Error ? error.message : 'Could not send feedback'
    // A server error (500s) may pass; anything else (too big, wrong type) won't, so stop retrying it.
    if (!/went wrong|unavailable|timeout/i.test(message)) await queueFeedback({ ...item, error: message })
    throw error
  }
}

/** Sends everything still waiting in this browser for this organization. Returns how many went. */
export async function flushFeedback(orgId: number, token: string): Promise<number> {
  let sent = 0
  for (const item of await queuedFeedback(orgId)) {
    if (item.error) continue
    try { if (await sendFeedback(item, token)) sent += 1 } catch { /* kept, with its error */ }
  }
  return sent
}

export async function discardQueued(id: string): Promise<void> { await dropQueued(id) }

export function cachedFeedbackList(orgId: number): CandidateFeedback[] {
  try { return JSON.parse(localStorage.getItem(LIST_KEY(orgId)) || '[]') } catch { return [] }
}

export function rememberFeedbackList(orgId: number, items: CandidateFeedback[]): void {
  try { localStorage.setItem(LIST_KEY(orgId), JSON.stringify(items.filter((item) => !item.queued).slice(0, 50))) } catch { /* only a head start */ }
}
