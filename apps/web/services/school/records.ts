import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

/** Answering a parent's records request from a learner's page (admins): download, who opened them, delete. */
const base = (orgId: number, userId: number) => `${getAPIUrl()}school/orgs/${orgId}/learners/${userId}/records`

export interface RecordsAccessItem {
  id: number
  at: string
  action: 'records.view' | 'records.export' | 'records.delete'
  what: string
  label: string
  detail: string
  by: { id: number | null; name: string; username?: string | null; avatar_image?: string | null; user_uuid?: string | null }
}

export interface RecordsAccess { items: RecordsAccessItem[]; offset: number; more: boolean }

export interface DeletePreview {
  name: string
  username: string
  can_delete: boolean
  blocked_reason: string | null
  removed: string[]
  kept: Array<{ what: string; why: string }>
}

export const recordsKeys = {
  access: (orgId: number, userId: number, offset = 0) => `${base(orgId, userId)}/access?offset=${offset}`,
  deletePreview: (orgId: number, userId: number) => `${base(orgId, userId)}/delete`,
}

async function request<T>(url: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  return errorHandling(await fetch(url, RequestBodyWithAuthHeader(method, body, null, token)))
}

export const recordsApi = {
  access: (orgId: number, userId: number, token?: string, offset = 0) => request<RecordsAccess>(recordsKeys.access(orgId, userId, offset), token),
  deletePreview: (orgId: number, userId: number, token?: string) => request<DeletePreview>(recordsKeys.deletePreview(orgId, userId), token),
  remove: (orgId: number, userId: number, confirm: string, token?: string) =>
    request<{ detail: string }>(recordsKeys.deletePreview(orgId, userId), token, 'POST', { confirm }),
  /** Saves the learner's records zip in the browser and returns its file name. */
  async download(orgId: number, userId: number, token: string): Promise<string> {
    const response = await fetch(`${base(orgId, userId)}/export`, RequestBodyWithAuthHeader('GET', null, null, token))
    if (!response.ok) {
      await errorHandling(response)
      throw new Error('The records could not be downloaded.')
    }
    const name = (response.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'records.zip'
    const href = URL.createObjectURL(await response.blob())
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = name
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
    return name
  },
}
