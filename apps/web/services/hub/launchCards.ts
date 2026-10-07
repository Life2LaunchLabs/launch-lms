export type HubLaunchCard = {
  label: string
  hint: string
  first_message: string
}

export type HubLaunchCardsSettings = {
  cards: HubLaunchCard[]
  is_default: boolean
}

export const HUB_LAUNCH_CARDS_PATH = 'hub/launch-cards'
export const MAX_LAUNCH_CARDS = 6
export const LAUNCH_CARD_LIMITS = { label: 80, hint: 120, first_message: 300 } as const

// Shown if the platform cards cannot be loaded, so the Hub home is never empty.
export const FALLBACK_LAUNCH_CARDS: HubLaunchCard[] = [
  { label: 'Not sure what comes next', hint: 'Figure out a first step together', first_message: "I'm not sure what to do after high school. Can you help me find one small thing to try first?" },
  { label: 'I have a career in mind', hint: 'See what it would take to get there', first_message: 'I have a career in mind and want to know what a good first step would be.' },
  { label: 'Build real experience', hint: 'Projects, jobs and ways to try things', first_message: 'I want to build experience that shows what I can do. Where could I start?' },
  { label: 'Stay on track to graduate', hint: 'Check what you still need', first_message: 'I want to stay on track to graduate. What should I focus on right now?' },
]

export const usableLaunchCards = (cards: unknown): HubLaunchCard[] =>
  Array.isArray(cards) ? cards.filter((card): card is HubLaunchCard => Boolean(card?.label && card?.first_message)) : []

// Returns the problem with a draft card set, or null when it can be saved.
export function launchCardsProblem(cards: HubLaunchCard[]): string | null {
  if (cards.length < 1) return 'Keep at least one card.'
  if (cards.length > MAX_LAUNCH_CARDS) return `Use at most ${MAX_LAUNCH_CARDS} cards.`
  if (cards.some((card) => !card.label.trim() || !card.first_message.trim())) return 'Every card needs a title and an opening message.'
  return null
}
