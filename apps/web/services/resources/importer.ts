import { getAPIUrl } from '@services/config/config'
import { RequestBodyFormWithAuthHeader, RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { ResourceType } from './resources'

// Spreadsheet import (apps/api/src/services/resource_import.py): read the file, match columns, check, import.

export type ImportField = 'link' | 'title' | 'description' | 'type' | 'provider' | 'minutes' | 'channel' | 'tags' | 'skip'

export const IMPORT_FIELDS: Array<{ value: ImportField; label: string }> = [
  { value: 'link', label: 'Link' },
  { value: 'title', label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'type', label: 'Type' },
  { value: 'provider', label: 'Provider' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'channel', label: 'Channel' },
  { value: 'tags', label: 'Tags' },
  { value: 'skip', label: 'Don’t import' },
]

export type SheetRead = {
  file_name: string
  columns: Array<{ name: string; field: ImportField; example: string }>
  rows: string[][]
  /** The file had more rows than one import takes. */
  truncated: boolean
}

export type ImportDestination = { destination: 'column' | 'one' | 'none'; channel_uuid?: string | null; channel_name?: string | null }

export type ImportResult = {
  rows: Array<{ row: number; link: string; title: string; type: ResourceType; channels: string[]; status: 'ready' | 'duplicate' | 'repeat' | 'invalid'; error?: string }>
  ready: number
  duplicates: number
  invalid: number
  new_channels: string[]
  channel_count: number
  created: number
}

/** Each row as {field: value} for the columns matched to a field; a field matched twice keeps the first non-empty value. */
export function mapRows(read: SheetRead, fields: ImportField[]): Array<Record<string, string>> {
  return read.rows.map((row) => {
    const out: Record<string, string> = {}
    fields.forEach((field, index) => { if (field !== 'skip' && !out[field] && row[index]) out[field] = row[index] })
    return out
  })
}

export const TEMPLATE_CSV = 'link,title,description,type,provider,minutes,channel,tags\nhttps://www.bls.gov/ooh/,Occupational Outlook Handbook,"Pay, training and outlook for hundreds of jobs",tool,U.S. Bureau of Labor Statistics,15,Exploring careers,careers; research\n'

export const importApi = {
  read: (orgId: number, file: File, token?: string) => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`${getAPIUrl()}resources/org/${orgId}/import/read`, RequestBodyFormWithAuthHeader('POST', form, null, token as string)).then(errorHandling) as Promise<SheetRead>
  },
  run: (orgId: number, rows: Array<Record<string, string>>, where: ImportDestination, dryRun: boolean, token?: string) =>
    fetch(`${getAPIUrl()}resources/org/${orgId}/import`, RequestBodyWithAuthHeader('POST', { rows, ...where, dry_run: dryRun }, null, token)).then(errorHandling) as Promise<ImportResult>,
}
