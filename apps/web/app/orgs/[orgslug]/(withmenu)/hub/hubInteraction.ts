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
const RESOURCE_WORDS = /\b(?:resources?|guides?|videos?|articles?|courses?|tools?|templates?|examples?|tutorials?|worksheets?|checklists?|assessments?)\b/i
const ADVICE_WORDS = /\b(?:advice|advise|recommend|suggest|think|decide|choose|feel|worried|help)\b/i

export function inferHubResponseKind(content: string): HubResponseKind {
  const normalized = content.trim()
  if (!normalized) return 'chat'
  if (normalized.includes('?') || QUESTION_OPENERS.test(normalized) || ADVICE_WORDS.test(normalized)) return 'chat'
  if (SEARCH_OPENERS.test(normalized) || RESOURCE_WORDS.test(normalized)) return 'search'
  const words = normalized.split(/\s+/)
  return words.length <= 6 && !/[.!]$/.test(normalized) ? 'search' : 'chat'
}

type SearchableResource = {
  title: string
  description?: string | null
  provider_name?: string | null
  resource_type?: string | null
  tags?: Array<string | { name: string }>
}

function searchTerms(value: string) {
  const ignored = new Set(['a', 'an', 'and', 'about', 'browse', 'find', 'for', 'look', 'me', 'on', 'please', 'resource', 'resources', 'search', 'show', 'some', 'the'])
  return (value.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((term) => term.length > 1)
    .map((term) => term.endsWith('ies') && term.length > 4 ? `${term.slice(0, -3)}y` : term.endsWith('s') && term.length > 3 ? term.slice(0, -1) : term)
    .map((term) => term.endsWith('ing') && term.length > 5 ? term.slice(0, -3) : term)
    .filter((term) => !ignored.has(term))
}

export function filterHubSearchResources<T extends SearchableResource>(resources: T[], query: string) {
  const queryTerms = searchTerms(query)
  if (queryTerms.length === 0) return resources
  return resources
    .map((resource, index) => {
      const tags = (resource.tags || []).map((tag) => typeof tag === 'string' ? tag : tag.name).join(' ')
      const titleTerms = new Set(searchTerms(resource.title))
      const allTerms = new Set(searchTerms([resource.title, resource.description, resource.provider_name, resource.resource_type, tags].filter(Boolean).join(' ')))
      const matched = queryTerms.filter((term) => allTerms.has(term))
      const score = matched.length * 2 + queryTerms.filter((term) => titleTerms.has(term)).length * 3
      return { resource, index, matched: matched.length, score }
    })
    .filter((result) => result.matched === queryTerms.length)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((result) => result.resource)
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
