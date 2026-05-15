import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type RoadmapBlockVisibility = 'user' | 'org'
export type RoadmapBlockCategory = 'work' | 'education' | 'life'
export type RoadmapBlockType = 'employment' | 'learning' | 'personal'
export type RoadmapCashflowDirection = 'income' | 'expense'
export type RoadmapCashflowPeriod = 'total' | 'yearly' | 'monthly'
export type RoadmapPathwayStatus = 'draft' | 'active' | 'archived'
export type RoadmapRequirementLogic = 'required' | 'one_of'

export interface RoadmapBlock {
  block_uuid: string
  visibility: RoadmapBlockVisibility
  owner_user_id: number | null
  editable: boolean
  lane_category: RoadmapBlockCategory
  block_type: RoadmapBlockType
  title: string
  description: string | null
  starred: boolean
  is_draft: boolean
  skill_fit_score: number | null
  lifestyle_fit_score: number | null
  confidence_score: number | null
  target_annual_income: number | null
  expected_annual_income_low: number | null
  expected_annual_income_mid: number | null
  expected_annual_income_high: number | null
  default_monthly_income: number | null
  default_monthly_expense: number | null
  default_one_time_cost: number | null
  cashflow_amount: number | null
  cashflow_direction: RoadmapCashflowDirection | null
  cashflow_period: RoadmapCashflowPeriod | null
  cashflow_stddev: number | null
  notes: string | null
  creation_date: string
  update_date: string
}

export interface RoadmapRequirementStatus {
  requirement_uuid: string
  required_block: RoadmapBlock
  met: boolean
  met_by_pathway_block_uuid: string | null
  group_key: string | null
  logic: RoadmapRequirementLogic
}

export interface RoadmapPathway {
  pathway_uuid: string
  title: string
  description: string | null
  status: RoadmapPathwayStatus
  creation_date: string
  update_date: string
}

export interface RoadmapPathwayBlock {
  pathway_block_uuid: string
  block: RoadmapBlock
  start_date: string
  end_date: string | null
  is_ongoing: boolean
  title_override: string | null
  description_override: string | null
  monthly_income_override: number | null
  monthly_expense_override: number | null
  one_time_cost_override: number | null
  notes: string | null
  sort_order: number
  unmet_requirements: RoadmapRequirementStatus[]
  creation_date: string
  update_date: string
}

export interface RoadmapSummary {
  start_date: string | null
  end_date: string | null
  total_months: number
  months_until_first_income: number | null
  months_until_sustaining_income: number | null
  total_estimated_cost: number
  total_estimated_income: number
  lowest_projected_cash_position: number
  support_needed: number
  unmet_requirement_count: number
}

export interface RoadmapPathwayDetail {
  pathway: RoadmapPathway
  blocks: RoadmapPathwayBlock[]
  summary: RoadmapSummary
}

export type RoadmapBlockPayload = Partial<Omit<RoadmapBlock, 'block_uuid' | 'owner_user_id' | 'editable' | 'creation_date' | 'update_date'>>
export type RoadmapPathwayBlockPayload = Partial<Omit<RoadmapPathwayBlock, 'pathway_block_uuid' | 'block' | 'unmet_requirements' | 'creation_date' | 'update_date'>> & { block_uuid?: string | null, title?: string | null, lane_category?: RoadmapBlockCategory, block_type?: RoadmapBlockType }

export async function getRoadmapBlocks(orgId: number, accessToken: string) {
  const result: any = await fetch(`${getAPIUrl()}roadmap/org/${orgId}/blocks`, RequestBodyWithAuthHeader('GET', null, null, accessToken))
  return errorHandling(result) as Promise<RoadmapBlock[]>
}

export async function createRoadmapBlock(orgId: number, data: RoadmapBlockPayload, accessToken: string) {
  const result: any = await fetch(`${getAPIUrl()}roadmap/org/${orgId}/blocks`, RequestBodyWithAuthHeader('POST', data, null, accessToken))
  return errorHandling(result) as Promise<RoadmapBlock>
}

export async function updateRoadmapBlock(orgId: number, blockUuid: string, data: RoadmapBlockPayload, accessToken: string) {
  const result: any = await fetch(`${getAPIUrl()}roadmap/org/${orgId}/blocks/${blockUuid}`, RequestBodyWithAuthHeader('PUT', data, null, accessToken))
  return errorHandling(result) as Promise<RoadmapBlock>
}

export async function deleteRoadmapBlock(orgId: number, blockUuid: string, accessToken: string) {
  const result: any = await fetch(`${getAPIUrl()}roadmap/org/${orgId}/blocks/${blockUuid}`, RequestBodyWithAuthHeader('DELETE', null, null, accessToken))
  return errorHandling(result) as Promise<{ success: boolean }>
}

export async function createRoadmapBlockRequirement(orgId: number, blockUuid: string, data: { required_block_uuid: string; group_key?: string | null; logic?: RoadmapRequirementLogic; sort_order?: number }, accessToken: string) {
  const result: any = await fetch(`${getAPIUrl()}roadmap/org/${orgId}/blocks/${blockUuid}/requirements`, RequestBodyWithAuthHeader('POST', data, null, accessToken))
  return errorHandling(result)
}

export async function getRoadmapPathways(orgId: number, accessToken: string) {
  const result: any = await fetch(`${getAPIUrl()}roadmap/org/${orgId}/pathways`, RequestBodyWithAuthHeader('GET', null, null, accessToken))
  return errorHandling(result) as Promise<RoadmapPathwayDetail[]>
}

export async function createRoadmapPathway(orgId: number, data: { title: string; description?: string | null; status?: RoadmapPathwayStatus }, accessToken: string) {
  const result: any = await fetch(`${getAPIUrl()}roadmap/org/${orgId}/pathways`, RequestBodyWithAuthHeader('POST', data, null, accessToken))
  return errorHandling(result) as Promise<RoadmapPathwayDetail>
}

export async function ensureDefaultRoadmapPathway(orgId: number, accessToken: string) {
  const result: any = await fetch(`${getAPIUrl()}roadmap/org/${orgId}/pathways/ensure-default`, RequestBodyWithAuthHeader('POST', null, null, accessToken))
  return errorHandling(result) as Promise<RoadmapPathwayDetail>
}

export async function updateRoadmapPathway(orgId: number, pathwayUuid: string, data: { title?: string; description?: string | null; status?: RoadmapPathwayStatus }, accessToken: string) {
  const result: any = await fetch(`${getAPIUrl()}roadmap/org/${orgId}/pathways/${pathwayUuid}`, RequestBodyWithAuthHeader('PUT', data, null, accessToken))
  return errorHandling(result) as Promise<RoadmapPathwayDetail>
}

export async function createRoadmapPathwayBlock(orgId: number, pathwayUuid: string, data: RoadmapPathwayBlockPayload, accessToken: string) {
  const result: any = await fetch(`${getAPIUrl()}roadmap/org/${orgId}/pathways/${pathwayUuid}/blocks`, RequestBodyWithAuthHeader('POST', data, null, accessToken))
  return errorHandling(result) as Promise<RoadmapPathwayDetail>
}

export async function updateRoadmapPathwayBlock(orgId: number, pathwayBlockUuid: string, data: RoadmapPathwayBlockPayload, accessToken: string) {
  const result: any = await fetch(`${getAPIUrl()}roadmap/org/${orgId}/pathway-blocks/${pathwayBlockUuid}`, RequestBodyWithAuthHeader('PUT', data, null, accessToken))
  return errorHandling(result) as Promise<RoadmapPathwayDetail>
}

export async function deleteRoadmapPathwayBlock(orgId: number, pathwayBlockUuid: string, accessToken: string) {
  const result: any = await fetch(`${getAPIUrl()}roadmap/org/${orgId}/pathway-blocks/${pathwayBlockUuid}`, RequestBodyWithAuthHeader('DELETE', null, null, accessToken))
  return errorHandling(result) as Promise<RoadmapPathwayDetail>
}
