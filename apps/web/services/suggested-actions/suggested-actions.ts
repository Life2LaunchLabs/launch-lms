import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  errorHandling,
} from '@services/utils/ts/requests'
import useSWR from 'swr'

export type SuggestedActionKind =
  | 'continue_learning'
  | 'profile_completion'
  | 'content_discovery'
  | 'onboarding'
  | 'announcement'
  | 'scaffolded_path'
  | 'new_content'
  | 'community_activity'
  | 'message'

export type SuggestedActionEventType =
  | 'viewed'
  | 'clicked'
  | 'dismissed'
  | 'completed'
  | 'route_visited'

export type SuggestedAction = {
  key: string
  source: string
  kind: SuggestedActionKind
  title: string
  subtext?: string | null
  href: string
  targetHref?: string | null
  surface?: string | null
  slot?: string | null
  context?: string | null
  imageUrl?: string | null
  textTone?: 'dark' | 'light'
  priority: number
  dismissible: boolean
  badgeCount?: number | null
  badgeKind?: 'dot' | 'count'
  expiresAt?: string | null
  metadata?: Record<string, unknown>
}

export function getSuggestedActionsUrl({
  orgId,
  surface = 'journey',
  slot = 'primary',
  context,
  limit = 3,
}: {
  orgId: number | string
  surface?: string
  slot?: string
  context?: string | null
  limit?: number
}) {
  const params = new URLSearchParams({
    surface,
    slot,
    limit: String(limit),
  })
  if (context) params.set('context', context)
  return `${getAPIUrl()}suggested-actions/org/${orgId}?${params.toString()}`
}

export async function suggestedActionsFetcher(
  url: string,
  accessToken?: string
): Promise<SuggestedAction[]> {
  const response = await fetch(
    url,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(response)
}

export async function recordSuggestedActionEvent({
  orgId,
  actionKey,
  eventType,
  surface = 'journey',
  context,
  metadata = {},
  accessToken,
}: {
  orgId: number | string
  actionKey: string
  eventType: SuggestedActionEventType
  surface?: string
  context?: string | null
  metadata?: Record<string, unknown>
  accessToken?: string
}) {
  const response = await fetch(
    `${getAPIUrl()}suggested-actions/org/${orgId}/events`,
    RequestBodyWithAuthHeader(
      'POST',
      {
        action_key: actionKey,
        event_type: eventType,
        surface,
        context,
        metadata,
      },
      null,
      accessToken
    )
  )
  return errorHandling(response)
}

export function useSuggestedActions({
  orgId,
  accessToken,
  surface = 'journey',
  slot = 'primary',
  context,
  limit = 3,
  enabled = true,
}: {
  orgId?: number | string | null
  accessToken?: string
  surface?: string
  slot?: string
  context?: string | null
  limit?: number
  enabled?: boolean
}) {
  const url =
    enabled && orgId && accessToken
      ? getSuggestedActionsUrl({ orgId, surface, slot, context, limit })
      : null

  return useSWR<SuggestedAction[]>(
    url,
    (requestUrl: string) => suggestedActionsFetcher(requestUrl, accessToken),
    {
      revalidateOnFocus: false,
    }
  )
}
