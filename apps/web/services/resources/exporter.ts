import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { ResourceType } from './resources'

// Spreadsheet export (apps/api/src/services/resource_export.py). Simple columns are the ones the import reads.

export type ExportDetail = 'simple' | 'full'
export type ExportFormat = 'xlsx' | 'csv'
/** Stands for resources in no channel. */
export const NO_CHANNEL = 'none'

export type ExportFilter = { channels: string[]; types: ResourceType[]; starred: boolean }
export type ExportOptions = ExportFilter & { detail: ExportDetail; format: ExportFormat }

/** How many rows each choice in the dialog gives (resource_export.export_counts). */
export type ExportCounts = {
  /** Per channel uuid (and NO_CHANNEL), with the starred filter. */
  channels: Record<string, number>
  /** No channel filter, with the starred filter. */
  any: number
  /** Per type, within the chosen channels. */
  types: Partial<Record<ResourceType, number>>
  /** Within the chosen channels and types: all of them, the starred ones, and what the download holds. */
  all: number
  starred: number
  total: number
}

const filterParams = (filter: ExportFilter, params = new URLSearchParams()) => {
  if (filter.channels.length) params.set('channels', filter.channels.join(','))
  if (filter.types.length) params.set('types', filter.types.join(','))
  if (filter.starred) params.set('starred', 'true')
  return params
}

export const exportCountsKey = (orgId: number, filter: ExportFilter) => `${getAPIUrl()}resources/org/${orgId}/export/counts?${filterParams(filter)}`

const nameFrom = (header: string | null, fallback: string) => /filename="([^"]+)"/.exec(header || '')?.[1] || fallback

export const exportApi = {
  counts: (orgId: number, filter: ExportFilter, token?: string) =>
    fetch(exportCountsKey(orgId, filter), RequestBodyWithAuthHeader('GET', null, null, token)).then(errorHandling) as Promise<ExportCounts>,
  /** Downloads the spreadsheet. Empty channels or types means all of them. */
  download: async (orgId: number, options: ExportOptions, token?: string) => {
    const params = filterParams(options, new URLSearchParams({ detail: options.detail, format: options.format }))
    const response = await fetch(`${getAPIUrl()}resources/org/${orgId}/export?${params}`, RequestBodyWithAuthHeader('GET', null, null, token))
    if (!response.ok) await errorHandling(response)
    const blob = await response.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    // The header can be unreadable across origins; the fallback matches what the server names it.
    link.download = nameFrom(response.headers.get('Content-Disposition'), `resources${options.detail === 'full' ? '-full' : ''}-${new Date().toISOString().slice(0, 10)}.${options.format}`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  },
}
