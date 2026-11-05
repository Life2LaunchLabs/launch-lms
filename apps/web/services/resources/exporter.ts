import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { ResourceType } from './resources'

// Spreadsheet export (apps/api/src/services/resource_export.py). Simple columns are the ones the import reads.

export type ExportDetail = 'simple' | 'full'
export type ExportFormat = 'xlsx' | 'csv'
/** Stands for resources in no channel. */
export const NO_CHANNEL = 'none'

export type ExportOptions = { detail: ExportDetail; format: ExportFormat; channels: string[]; types: ResourceType[] }

const nameFrom = (header: string | null, fallback: string) => /filename="([^"]+)"/.exec(header || '')?.[1] || fallback

export const exportApi = {
  /** Downloads the spreadsheet. Empty channels or types means all of them. */
  download: async (orgId: number, options: ExportOptions, token?: string) => {
    const params = new URLSearchParams({ detail: options.detail, format: options.format })
    if (options.channels.length) params.set('channels', options.channels.join(','))
    if (options.types.length) params.set('types', options.types.join(','))
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
