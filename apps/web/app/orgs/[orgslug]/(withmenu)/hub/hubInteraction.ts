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
