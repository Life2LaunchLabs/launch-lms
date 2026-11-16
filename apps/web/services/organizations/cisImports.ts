import { getAPIUrl } from '@services/config/config'
import { RequestBodyFormWithAuthHeader, RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

// Staff sending learners their Oregon CIS work (api: routers/orgs/cis_imports.py). The file is read twice: once
// for the preview, then again with the picked learners when sending, so nothing is stored until staff send.
export type CisLearner = { key: string; name: string; email: string; problem: string | null; items: number; groups: Record<string, number>; kept: Record<string, number> }
export type CisPreview = { kind: 'bulk' | 'single'; learners: CisLearner[]; unmatched: Record<string, number>; skipped_files: number }
export type CisSendResult = { sent: number; results: Array<{ key: string; email: string; status: string; detail?: string | null; email_sent?: boolean | null }> }
export type CisSent = { held_uuid: string; learner_name: string; email: string; status: 'held' | 'imported' | 'declined' | 'withdrawn' | 'expired'; summary: { items?: number }; created_at: string; expires_at: string; imported_at: string | null }

const base = (orgId: number) => `${getAPIUrl()}orgs/${orgId}/cis-imports`

export async function previewCisExport(orgId: number, file: File, token: string): Promise<CisPreview> {
  const form = new FormData()
  form.append('file', file)
  return errorHandling(await fetch(`${base(orgId)}/preview`, RequestBodyFormWithAuthHeader('POST', form, null, token)))
}

export async function sendCisInvitations(orgId: number, file: File, learners: Array<{ key: string; email: string }>, options: { note?: string; usergroupId?: number }, token: string): Promise<CisSendResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('learners', JSON.stringify(learners))
  if (options.note) form.append('note', options.note)
  if (options.usergroupId) form.append('usergroup_id', String(options.usergroupId))
  return errorHandling(await fetch(base(orgId), RequestBodyFormWithAuthHeader('POST', form, null, token)))
}

export async function listCisSent(orgId: number, token: string): Promise<CisSent[]> {
  return errorHandling(await fetch(base(orgId), RequestBodyWithAuthHeader('GET', null, null, token)))
}

export async function withdrawCisWork(orgId: number, heldUuid: string, token: string) {
  return errorHandling(await fetch(`${base(orgId)}/${encodeURIComponent(heldUuid)}`, RequestBodyWithAuthHeader('DELETE', null, null, token)))
}
