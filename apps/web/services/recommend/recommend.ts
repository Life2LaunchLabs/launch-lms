import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { Resource } from '@services/resources/resources'

/** A suggested resource: the card fields, why it's here, and which shelf it came from. */
export type Suggestion = Pick<Resource, 'resource_uuid' | 'title' | 'description' | 'resource_type' | 'provider_name' | 'provider_url' | 'external_url'
  | 'cover_image_url' | 'thumbnail_image' | 'owner_org_uuid' | 'estimated_time' | 'access_mode' | 'is_featured'> & {
  is_saved: boolean
  in_list: boolean
  reason?: string
  shelf?: string
}
export interface SuggestionShelf { key: string; title: string; why: string; items: Suggestion[] }
export interface PhaseList { user_channel_uuid: string; name: string; count: number; items: Suggestion[] }
export interface PhaseSuggestions {
  context: { key: string; label: string }
  picks: Suggestion[]
  shelves: SuggestionShelf[]
  list: PhaseList | null
}
export type SuggestionEvent = { kind: 'shown' | 'open' | 'hide' | 'unhide'; resource_uuid: string; context: string; shelf?: string; position?: number }

const url = (path: string) => `${getAPIUrl()}recommend${path}`

async function request<T = any>(path: string, token?: string, method = 'GET', body: any = null): Promise<T> {
  return errorHandling(await fetch(url(path), RequestBodyWithAuthHeader(method, body, null, token)))
}

export const recommendApi = {
  /** A phase's picks for its page, the shelves behind See more, and what's saved to it. */
  phase: (phaseId: string, orgId: number, token?: string) => request<PhaseSuggestions>(`/phase/${encodeURIComponent(phaseId)}?org_id=${orgId}`, token),
  /** Save to the phase's Library list (made the first time) and to the Library. */
  saveToPhase: (phaseId: string, orgId: number, resourceUuid: string, shelf: string | undefined, token?: string) =>
    request<{ user_channel_uuid: string; name: string; count: number }>(`/phase/${encodeURIComponent(phaseId)}/save`, token, 'POST', { org_id: orgId, resource_uuid: resourceUuid, shelf: shelf || '' }),
  /** Out of the phase's list; it stays in the Library. */
  removeFromPhase: (phaseId: string, orgId: number, resourceUuid: string, token?: string) =>
    request(`/phase/${encodeURIComponent(phaseId)}/save/${encodeURIComponent(resourceUuid)}?org_id=${orgId}`, token, 'DELETE'),
  /** What the person saw and did; never in the way of what they're doing. */
  events: (orgId: number, events: SuggestionEvent[], token?: string) =>
    request(`/events`, token, 'POST', { org_id: orgId, events }).catch(() => undefined),
}
