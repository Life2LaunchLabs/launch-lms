export type HubBehavior = 'auto' | 'search' | 'ask'
export type AutoView = 'discover' | 'conversation'

export function showsHubDiscovery(behavior: HubBehavior, autoView: AutoView) {
  return behavior === 'search' || (behavior === 'auto' && autoView === 'discover')
}

export function hubCanAsk(behavior: HubBehavior) {
  return behavior !== 'search'
}

export function autoViewAfterBehaviorChange(
  currentBehavior: HubBehavior,
  nextBehavior: HubBehavior,
  hasConversation: boolean
): AutoView | null {
  if (nextBehavior !== 'auto') return null
  if (currentBehavior === 'search') return 'discover'
  return hasConversation ? 'conversation' : 'discover'
}

export function advisorFailureRecovery<T extends string>(content: string, selectedTypes: T[], allType: T) {
  return {
    draft: content,
    selectedTypes: selectedTypes.length ? selectedTypes : [allType],
    autoView: 'discover' as const,
  }
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
