import { getAPIUrl } from '@services/config/config'
import { errorHandling, RequestBodyWithAuthHeader } from '@services/utils/ts/requests'
import type { Resource } from '@services/resources/resources'

export interface LaunchPlanSectionSummary {
  section_uuid: string
  slug: string
  title: string
  description: string
  explanation: string
  notes: string
  intro_seen_at: string | null
  card_count: number
  card_summaries: {
    card_uuid: string
    title: string
    outcome_text: string | null
    outcome_link: string | null
    outcome_file: string | null
  }[]
}

export interface LaunchPlanCanvas {
  canvas_uuid: string
  slug: string
  title: string
  description: string
  sections: LaunchPlanSectionSummary[]
}

export interface LaunchPlanCard {
  card_uuid: string
  card_type: 'resource_outcome'
  source_uuid: string
  grid: { x?: number; y?: number; w?: number; h?: number }
  source?: {
    title: string
    outcome_text: string | null
    outcome_link: string | null
    outcome_file: string | null
  }
}

export interface LaunchPlanWorkspace {
  section: {
    section_uuid: string
    canvas_slug: string
    canvas_title: string
    title: string
    description: string
    explanation: string
    resource_tag_uuid: string
  }
  notes: string
  intro_seen_at: string | null
  cards: LaunchPlanCard[]
  resources: Resource[]
}

export async function getLaunchPlanCanvases(orgId: number, accessToken: string) {
  const response = await fetch(
    `${getAPIUrl()}launch-plan/org/${orgId}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(response) as Promise<LaunchPlanCanvas[]>
}

export async function getLaunchPlanWorkspace(orgId: number, sectionUuid: string, accessToken: string) {
  const response = await fetch(
    `${getAPIUrl()}launch-plan/org/${orgId}/sections/${sectionUuid}`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  return errorHandling(response) as Promise<LaunchPlanWorkspace>
}

export async function markLaunchPlanIntroSeen(orgId: number, sectionUuid: string, accessToken: string) {
  const response = await fetch(
    `${getAPIUrl()}launch-plan/org/${orgId}/sections/${sectionUuid}/intro-seen`,
    RequestBodyWithAuthHeader('POST', {}, null, accessToken)
  )
  return errorHandling(response)
}

export async function updateLaunchPlanWorkspace(
  orgId: number,
  sectionUuid: string,
  data: Pick<LaunchPlanWorkspace, 'notes' | 'cards'>,
  accessToken: string
) {
  const response = await fetch(
    `${getAPIUrl()}launch-plan/org/${orgId}/sections/${sectionUuid}`,
    RequestBodyWithAuthHeader('PUT', {
      notes: data.notes,
      cards: data.cards.map((card) => ({
        card_uuid: card.card_uuid,
        card_type: card.card_type,
        source_uuid: card.source_uuid,
        grid: card.grid,
      })),
    }, null, accessToken)
  )
  return errorHandling(response) as Promise<LaunchPlanWorkspace>
}
