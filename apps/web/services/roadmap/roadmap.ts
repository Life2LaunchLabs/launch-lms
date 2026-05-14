import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  errorHandling,
} from '@services/utils/ts/requests'

export type RoadmapOptionStatus = 'draft' | 'active' | 'archived'
export type RoadmapEndStateType = 'occupation' | 'entrepreneurship' | 'education' | 'life' | 'custom'
export type RoadmapRequirementCategory = 'education' | 'work' | 'credential' | 'life' | 'financial' | 'custom'
export type RoadmapRequirementLogic = 'required' | 'one_of'
export type RoadmapEventCategory = 'work' | 'education' | 'life'

export interface RoadmapOption {
  roadmap_uuid: string
  title: string
  description: string | null
  end_state_title: string
  end_state_type: RoadmapEndStateType
  status: RoadmapOptionStatus
  skill_fit_score: number | null
  lifestyle_fit_score: number | null
  confidence_score: number | null
  target_annual_income: number | null
  expected_annual_income_low: number | null
  expected_annual_income_mid: number | null
  expected_annual_income_high: number | null
  expected_monthly_living_expenses: number | null
  notes: string | null
  end_state_option_uuid: string | null
  creation_date: string
  update_date: string
}

export interface RoadmapTemplateEvent {
  template_event_uuid: string
  category: RoadmapEventCategory
  title: string
  description: string | null
  start_offset_months: number
  duration_months: number
  dependency_key: string | null
  fork_group_key: string | null
  optional: boolean
  estimated_monthly_income: number | null
  estimated_monthly_expense: number | null
  estimated_one_time_cost: number | null
  sort_order: number
  creation_date: string
  update_date: string
}

export interface RoadmapEndStateOption {
  option_uuid: string
  title: string
  description: string | null
  end_state_type: RoadmapEndStateType
  starred: boolean
  skill_fit_score: number | null
  lifestyle_fit_score: number | null
  confidence_score: number | null
  target_annual_income: number | null
  expected_annual_income_low: number | null
  expected_annual_income_mid: number | null
  expected_annual_income_high: number | null
  notes: string | null
  built_roadmap_uuid: string | null
  template_events: RoadmapTemplateEvent[]
  creation_date: string
  update_date: string
}

export interface RoadmapRequirement {
  requirement_uuid: string
  title: string
  description: string | null
  category: RoadmapRequirementCategory
  requirement_group_key: string | null
  requirement_logic: RoadmapRequirementLogic
  sort_order: number
  satisfied_by_event_uuid: string | null
  creation_date: string
  update_date: string
}

export interface RoadmapEvent {
  event_uuid: string
  category: RoadmapEventCategory
  title: string
  description: string | null
  start_date: string
  end_date: string | null
  is_ongoing: boolean
  employer: string | null
  institution: string | null
  estimated_monthly_income: number | null
  estimated_monthly_expense: number | null
  estimated_one_time_cost: number | null
  required_step: boolean
  requirement_uuid: string | null
  sort_order: number
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
  income_low: number | null
  income_mid: number | null
  income_high: number | null
  monthly_living_expenses: number | null
  skill_fit_score: number | null
  lifestyle_fit_score: number | null
  confidence_score: number | null
  requirement_count: number
  satisfied_requirement_count: number
}

export interface RoadmapDetail {
  option: RoadmapOption
  requirements: RoadmapRequirement[]
  events: RoadmapEvent[]
  summary: RoadmapSummary
}

export type RoadmapOptionPayload = Partial<Omit<RoadmapOption, 'roadmap_uuid' | 'creation_date' | 'update_date'>>
export type RoadmapEndStateOptionPayload = Partial<Omit<RoadmapEndStateOption, 'option_uuid' | 'built_roadmap_uuid' | 'template_events' | 'creation_date' | 'update_date'>>
export type RoadmapTemplateEventPayload = Partial<Omit<RoadmapTemplateEvent, 'template_event_uuid' | 'creation_date' | 'update_date'>>
export type RoadmapRequirementPayload = Partial<Omit<RoadmapRequirement, 'requirement_uuid' | 'satisfied_by_event_uuid' | 'creation_date' | 'update_date'>>
export type RoadmapEventPayload = Partial<Omit<RoadmapEvent, 'event_uuid' | 'creation_date' | 'update_date'>>

export async function getRoadmapEndStateOptions(orgId: number, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/end-states`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapEndStateOption[]>
}

export async function createRoadmapEndStateOption(orgId: number, data: RoadmapEndStateOptionPayload, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/end-states`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapEndStateOption>
}

export async function updateRoadmapEndStateOption(orgId: number, optionUuid: string, data: RoadmapEndStateOptionPayload, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/end-states/${optionUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapEndStateOption>
}

export async function createRoadmapTemplateEvent(orgId: number, optionUuid: string, data: RoadmapTemplateEventPayload, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/end-states/${optionUuid}/template-events`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapEndStateOption>
}

export async function updateRoadmapTemplateEvent(orgId: number, templateEventUuid: string, data: RoadmapTemplateEventPayload, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/template-events/${templateEventUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapEndStateOption>
}

export async function deleteRoadmapTemplateEvent(orgId: number, templateEventUuid: string, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/template-events/${templateEventUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapEndStateOption>
}

export async function createPathwayFromEndState(orgId: number, optionUuid: string, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/end-states/${optionUuid}/pathway`,
    RequestBodyWithAuthHeader('POST', null, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapDetail>
}

export async function getRoadmapOptions(orgId: number, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/options`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapDetail[]>
}

export async function getRoadmapOption(orgId: number, roadmapUuid: string, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/options/${roadmapUuid}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapDetail>
}

export async function createRoadmapOption(orgId: number, data: RoadmapOptionPayload, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/options`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapDetail>
}

export async function updateRoadmapOption(orgId: number, roadmapUuid: string, data: RoadmapOptionPayload, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/options/${roadmapUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapDetail>
}

export async function deleteRoadmapOption(orgId: number, roadmapUuid: string, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/options/${roadmapUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return errorHandling(result) as Promise<{ success: boolean }>
}

export async function createRoadmapRequirement(orgId: number, roadmapUuid: string, data: RoadmapRequirementPayload, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/options/${roadmapUuid}/requirements`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapDetail>
}

export async function updateRoadmapRequirement(orgId: number, requirementUuid: string, data: RoadmapRequirementPayload, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/requirements/${requirementUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapDetail>
}

export async function deleteRoadmapRequirement(orgId: number, requirementUuid: string, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/requirements/${requirementUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapDetail>
}

export async function createRoadmapEvent(orgId: number, roadmapUuid: string, data: RoadmapEventPayload, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/options/${roadmapUuid}/events`,
    RequestBodyWithAuthHeader('POST', data, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapDetail>
}

export async function updateRoadmapEvent(orgId: number, eventUuid: string, data: RoadmapEventPayload, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/events/${eventUuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapDetail>
}

export async function deleteRoadmapEvent(orgId: number, eventUuid: string, accessToken: string) {
  const result: any = await fetch(
    `${getAPIUrl()}roadmap/org/${orgId}/events/${eventUuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, accessToken)
  )
  return errorHandling(result) as Promise<RoadmapDetail>
}
