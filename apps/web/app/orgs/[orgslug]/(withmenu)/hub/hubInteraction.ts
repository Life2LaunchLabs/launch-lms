export type HubResponseKind = 'search' | 'chat'

type HubHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
  searchQuery?: string
}

export function hubAdvisorHistory(messages: HubHistoryMessage[], limit = 10) {
  return messages.slice(-limit).map((message) => ({
    role: message.role,
    content: message.searchQuery
      ? `Displayed resource search results for “${message.searchQuery}”.`
      : message.content,
  }))
}

const QUESTION_OPENERS = /^(?:how|why|what|when|where|who|which|should|can|could|would|will|do|does|did|is|are|am|tell|explain|help|i\b|we\b|hi\b|hello\b|hey\b|thanks?\b|good (?:morning|afternoon|evening)\b)/i
const SEARCH_OPENERS = /^(?:find|search|show me|look for|browse|resources? (?:for|about|on))\b/i
const RESOURCE_WORDS = /\b(?:resources?|guides?|videos?|articles?|courses?|tools?|templates?|examples?|tutorials?|worksheets?|checklists?|assessments?|quiz(?:zes)?)\b/i
const ADVICE_WORDS = /\b(?:advice|advise|recommend|suggest|think|decide|choose|feel|worried|help)\b/i

export function inferHubResponseKind(content: string): HubResponseKind {
  const normalized = content.trim()
  if (!normalized) return 'chat'
  if (normalized.includes('?') || QUESTION_OPENERS.test(normalized) || ADVICE_WORDS.test(normalized)) return 'chat'
  if (SEARCH_OPENERS.test(normalized) || RESOURCE_WORDS.test(normalized)) return 'search'
  // A short noun phrase is often an answer to Hub (a duration, date, choice or
  // confirmation). Prefer conversation unless the learner actually signals
  // search intent; the advisor can still offer a resource action afterward.
  return 'chat'
}

export function restoreSubmittedDraft(currentDraft: string, submittedContent: string) {
  return currentDraft.trim() ? currentDraft : submittedContent
}

export function addHubContextResource<T extends { resource_uuid: string }>(current: T[], resource: T, limit = 8) {
  return [...current.filter((item) => item.resource_uuid !== resource.resource_uuid), resource].slice(-limit)
}

export function addHubContextResources<T extends { resource_uuid: string }>(current: T[], resources: T[], limit = 8) {
  return resources.reduce((result, resource) => addHubContextResource(result, resource, limit), current)
}

export function newHubTranscriptResources<T extends { resource_uuid: string }>(
  introducedResourceUuids: Iterable<string>,
  resources: T[]
) {
  const seen = new Set(introducedResourceUuids)
  return resources.filter((resource) => {
    if (seen.has(resource.resource_uuid)) return false
    seen.add(resource.resource_uuid)
    return true
  })
}

export type HubResourceTrayEntry<T> = {
  resource: T
  originGroupId: string
}

export function buildHubResourceTrayEntries<T extends { resource_uuid: string }>(
  groups: Array<{ id: string; resources?: T[] }>
) {
  const seen = new Set<string>()
  const entries: HubResourceTrayEntry<T>[] = []
  for (const group of groups) {
    for (const resource of group.resources || []) {
      if (seen.has(resource.resource_uuid)) continue
      seen.add(resource.resource_uuid)
      entries.push({ resource, originGroupId: group.id })
    }
  }
  return entries
}

export function toggleHubContextResource(activeResourceUuid: string | null, resourceUuid: string) {
  return activeResourceUuid === resourceUuid ? null : resourceUuid
}

export function removeHubContextResource<T extends { resource_uuid: string }>(
  current: T[],
  activeResourceUuid: string | null,
  resourceUuid: string
) {
  return {
    resources: current.filter((item) => item.resource_uuid !== resourceUuid),
    activeResourceUuid: activeResourceUuid === resourceUuid ? null : activeResourceUuid,
  }
}
