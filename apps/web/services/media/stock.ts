import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { MediaAsset } from '@services/media/library'

export type StockKind = 'photo' | 'video'
export type StockOrientation = 'landscape' | 'portrait' | 'square'

export type MediaCredit = NonNullable<MediaAsset['credit']>

export type StockItem = {
  provider: string
  id: string
  kind: StockKind
  alt: string
  width?: number | null
  height?: number | null
  duration?: number | null
  preview_url: string
  download_url: string
  credit: MediaCredit
}

export type StockResults = { items: StockItem[]; page: number; total: number; has_more: boolean }

/** Free stock photos and videos (Pexels) the organization can add to its media library. */
export async function searchStockMedia(
  orgId: number,
  query: string,
  kind: StockKind,
  accessToken: string,
  options: { orientation?: StockOrientation; page?: number } = {}
): Promise<StockResults> {
  const params = new URLSearchParams({ org_id: String(orgId), q: query, kind, page: String(options.page || 1) })
  if (options.orientation) params.set('orientation', options.orientation)
  const result = await fetch(`${getAPIUrl()}media/stock/search?${params.toString()}`, RequestBodyWithAuthHeader('GET', null, null, accessToken))
  return errorHandling(result)
}

/** Copy one stock item into the organization's media library; the asset keeps its credit. */
export async function importStockMedia(
  orgId: number,
  item: Pick<StockItem, 'id' | 'kind' | 'provider'>,
  accessToken: string,
  options: { title?: string; folder?: string } = {}
): Promise<MediaAsset> {
  const result = await fetch(
    `${getAPIUrl()}media/stock/import`,
    RequestBodyWithAuthHeader('POST', { org_id: orgId, id: item.id, kind: item.kind, provider: item.provider, ...options }, null, accessToken)
  )
  return errorHandling(result)
}
