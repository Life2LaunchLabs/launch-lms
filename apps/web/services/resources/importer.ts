import { getAPIUrl } from '@services/config/config'
import { RequestBodyFormWithAuthHeader, RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { ResourceType } from './resources'

// Spreadsheet import (apps/api/src/services/resource_import.py): read the file, match columns, check, import.

export type ImportField = 'link' | 'title' | 'description' | 'type' | 'provider' | 'minutes' | 'channel' | 'tags' | 'starred' | 'id' | 'skip'

export const IMPORT_FIELDS: Array<{ value: ImportField; label: string }> = [
  { value: 'link', label: 'Link' },
  { value: 'title', label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'type', label: 'Type' },
  { value: 'provider', label: 'Provider' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'channel', label: 'Channel' },
  { value: 'tags', label: 'Tags' },
  { value: 'starred', label: 'Starred' },
  { value: 'id', label: 'Resource ID' },
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
  rows: Array<{
    row: number; link: string; title: string; type: ResourceType; channels: string[]
    /** update: it matches one of yours (by Resource ID, else link) and the row changes it; duplicate: it matches and changes nothing. */
    status: 'ready' | 'update' | 'duplicate' | 'repeat' | 'invalid'
    error?: string
    /** For an update, what it changes. */
    changes?: ImportChange[]
  }>
  ready: number
  /** Rows that match one of yours and change it. */
  updates: number
  duplicates: number
  invalid: number
  new_channels: string[]
  channel_count: number
  created: number
  updated: number
}

export type ImportChange = 'title' | 'description' | 'type' | 'provider' | 'minutes' | 'starred' | 'link' | 'tags' | 'channels'
export const CHANGE_LABELS: Record<ImportChange, string> = {
  title: 'title', description: 'description', type: 'type', provider: 'provider', minutes: 'minutes', starred: 'star', link: 'link', tags: 'tags', channels: 'channels',
}

/**
 * Each row as {field: value} for the columns matched to a field; a field matched twice keeps the first non-empty value.
 * A blank cell is left out (it keeps what a matched resource has), except Starred, where blank means not starred.
 */
export function mapRows(read: SheetRead, fields: ImportField[]): Array<Record<string, string>> {
  return read.rows.map((row) => {
    const out: Record<string, string> = {}
    fields.forEach((field, index) => { if (field !== 'skip' && !out[field] && row[index]) out[field] = row[index] })
    if (fields.includes('starred') && !out.starred) out.starred = ''
    return out
  })
}

export const TEMPLATE_CSV = 'link,title,description,type,provider,minutes,channel,tags,starred\nhttps://www.bls.gov/ooh/,Occupational Outlook Handbook,"Pay, training and outlook for hundreds of jobs",tool,U.S. Bureau of Labor Statistics,15,Exploring careers,careers; research,yes\n'

export const importApi = {
  read: (orgId: number, file: File, token?: string) => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`${getAPIUrl()}resources/org/${orgId}/import/read`, RequestBodyFormWithAuthHeader('POST', form, null, token as string)).then(errorHandling) as Promise<SheetRead>
  },
  /** Checks (dryRun) or imports the rows; updateExisting also applies the rows that change resources you have. */
  run: (orgId: number, rows: Array<Record<string, string>>, where: ImportDestination, dryRun: boolean, token?: string, updateExisting = false) =>
    fetch(`${getAPIUrl()}resources/org/${orgId}/import`, RequestBodyWithAuthHeader('POST', { rows, ...where, dry_run: dryRun, update_existing: updateExisting }, null, token)).then(errorHandling) as Promise<ImportResult>,
}
