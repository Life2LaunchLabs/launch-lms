import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader } from '@services/utils/ts/requests'

export interface TrendingItem {
  item_type: 'discussion' | 'resource' | 'course'
  item_uuid: string
  title: string
  last_event_date: string
  thumbnail_image: string | null
  community_name: string | null
  community_uuid: string | null
  resource_type: string | null
  org_slug: string
}

export async function getTrendingItems(
  org_uuid: string,
  access_token?: string,
  limit: number = 20,
): Promise<TrendingItem[]> {
  const url = `${getAPIUrl()}orgs/${org_uuid}/trending?limit=${limit}`
  const response = await fetch(
    url,
    RequestBodyWithAuthHeader('GET', null, null, access_token)
  )
  if (!response.ok) return []
  return response.json()
}
