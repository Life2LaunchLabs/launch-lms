import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  errorHandling,
  getResponseMetadata,
} from '@services/utils/ts/requests'

export type DevelopmentState = 'empty' | 'started' | 'emerging' | 'developed' | 'stale'
export type KnowledgeSourceType =
  | 'manual_note'
  | 'resource_outcome'
  | 'course_quiz_result'
  | 'reflection'
  | 'uploaded_file'
  | 'system_synthesis'

export interface FrameworkNode {
  id: number
  key: string
  parent_id: number | null
  title: string
  description: string | null
  node_type: string
  sort_order: number
  evidence_count: number
  insight_count: number
  development_state: DevelopmentState
  latest_update: string | null
  children: FrameworkNode[]
}

export interface KnowledgeEntry {
  entry_uuid: string
  source_type: KnowledgeSourceType
  source_content_type: string | null
  source_content_uuid: string | null
  title: string
  body: string | null
  source_url: string | null
  file_url: string | null
  raw_payload: Record<string, unknown>
  status: 'active' | 'archived'
  framework_nodes: { key: string; title: string }[]
  creation_date: string
  update_date: string
}

export interface UserInsight {
  insight_uuid: string
  framework_node_key: string
  insight_type: string
  label: string
  summary: string | null
  structured_value: Record<string, unknown>
  status: 'suggested' | 'confirmed' | 'dismissed' | 'archived'
  confidence: number | null
  evidence_entry_uuids: string[]
  creation_date: string
  update_date: string
}

export interface FrameworkProfile {
  framework_node_key: string
  summary: string | null
  development_state: DevelopmentState
  selected_lifestyle_option_key: string | null
  user_confidence: number | null
  reviewed_at: string | null
  update_date: string | null
}

export interface IdentitySummary {
  roots: FrameworkNode[]
  top_insights: UserInsight[]
  recent_evidence: KnowledgeEntry[]
  suggested_next_nodes: FrameworkNode[]
}

export interface IdentityNodeDetail {
  node: FrameworkNode
  profile: FrameworkProfile | null
  insights: UserInsight[]
  evidence: KnowledgeEntry[]
  tagged_content: {
    content_type: string
    content_uuid: string
    title: string
    intent: string
    relevance: number
    thumbnail_image: string | null
    cover_image_url: string | null
    owner_org_uuid: string | null
  }[]
}

export async function getIdentityFramework(orgId: number, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}identity/org/${orgId}/framework`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result) as Promise<FrameworkNode[]>
}

export async function getIdentitySummary(orgId: number, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}identity/org/${orgId}/summary`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result) as Promise<IdentitySummary>
}

export async function getIdentityNodeDetail(orgId: number, nodeKey: string, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}identity/org/${orgId}/nodes/${encodeURIComponent(nodeKey)}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result) as Promise<IdentityNodeDetail>
}

export async function createKnowledgeEntry(orgId: number, data: any, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}identity/org/${orgId}/entries`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result) as Promise<KnowledgeEntry>
}

export async function updateKnowledgeEntry(orgId: number, entryUuid: string, data: any, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}identity/org/${orgId}/entries/${entryUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result) as Promise<KnowledgeEntry>
}

export async function createUserInsight(orgId: number, data: any, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}identity/org/${orgId}/insights`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result) as Promise<UserInsight>
}

export async function updateUserInsight(orgId: number, insightUuid: string, data: any, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}identity/org/${orgId}/insights/${insightUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result) as Promise<UserInsight>
}

export async function updateFrameworkProfile(orgId: number, nodeKey: string, data: any, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}identity/org/${orgId}/profiles/${encodeURIComponent(nodeKey)}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return getResponseMetadata(result)
}
