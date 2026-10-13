import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type EvidenceExportScope = {
  user_ids: number[]
  assignment_uuid?: string
  usergroup_id?: number
  framework_uuid?: string
  course_name?: string
  course_code?: string
  section?: string
  term?: string
}

export async function downloadRequirementEvidence(orgId: number, scope: EvidenceExportScope, token?: string) {
  const response = await fetch(`${getAPIUrl()}planning/requirements/evidence-export?org_id=${orgId}`, RequestBodyWithAuthHeader('POST', scope, null, token))
  if (!response.ok) {
    await errorHandling(response)
    throw new Error('Could not export requirement evidence.')
  }
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'requirement-evidence.csv'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
