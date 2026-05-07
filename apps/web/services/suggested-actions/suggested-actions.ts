import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  errorHandling,
} from '@services/utils/ts/requests'

export type SuggestedActionKind =
  | 'continue_learning'
  | 'profile_completion'
  | 'content_discovery'
  | 'onboarding'
  | 'announcement'
  | 'scaffolded_path'

export type SuggestedActionEventType =
  | 'viewed'
  | 'clicked'
  | 'dismissed'
  | 'completed'

export type SuggestedAction = {
  key: string
  source: string
  kind: SuggestedActionKind
  title: string
  subtext?: string | null
  href: string
  imageUrl?: string | null
  textTone?: 'dark' | 'light'
  priority: number
  dismissible: boolean
  expiresAt?: string | null
  metadata?: Record<string, unknown>
}

export function getSuggestedActionsUrl({
  orgId,
  surface = 'journey',
  slot = 'primary',
  limit = 3,
}: {
  orgId: number | string
  surface?: string
  slot?: string
  limit?: number
}) {
  const params = new URLSearchParams({
    surface,
    slot,
    limit: String(limit),
  })
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
  metadata = {},
  accessToken,
}: {
  orgId: number | string
  actionKey: string
  eventType: SuggestedActionEventType
  surface?: string
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
        metadata,
      },
      null,
      accessToken
    )
  )
  return errorHandling(response)
}
