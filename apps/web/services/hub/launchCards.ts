export type HubLaunchCard = {
  label: string
  hint: string
  first_message: string
}

// Learners get one set; an organization's staff and admins get their own.
export type LaunchCardAudience = 'learner' | 'staff'

export type HubLaunchCardsSettings = {
  audience: LaunchCardAudience
  cards: HubLaunchCard[]
  is_default: boolean
}

export const HUB_LAUNCH_CARDS_PATH = 'hub/launch-cards'
// The server picks the set from the person's role in this organization.
export const hubLaunchCardsPath = (orgId?: number | null) => (orgId ? `${HUB_LAUNCH_CARDS_PATH}?org_id=${orgId}` : HUB_LAUNCH_CARDS_PATH)

const STAFF_ROLE_IDS = [1, 2]
type SessionRole = { org?: { id?: number }; role?: { id?: number } }
export const isStaffInOrg = (roles: unknown, orgId?: number | null): boolean =>
  Boolean(orgId) && Array.isArray(roles) && roles.some((entry: SessionRole) => entry?.org?.id === orgId && STAFF_ROLE_IDS.includes(Number(entry?.role?.id)))
export const MAX_LAUNCH_CARDS = 6
export const LAUNCH_CARD_LIMITS = { label: 80, hint: 120, first_message: 300 } as const

// Shown if the platform cards cannot be loaded, so Coach home is never empty.
export const FALLBACK_LAUNCH_CARDS: HubLaunchCard[] = [
  { label: 'Not sure what comes next', hint: 'Figure out a first step together', first_message: "I'm not sure what to do after high school. Can you help me find one small thing to try first?" },
  { label: 'I have a career in mind', hint: 'See what it would take to get there', first_message: 'I have a career in mind and want to know what a good first step would be.' },
  { label: 'Build real experience', hint: 'Projects, jobs and ways to try things', first_message: 'I want to build experience that shows what I can do. Where could I start?' },
  { label: 'Stay on track to graduate', hint: 'Check what you still need', first_message: 'I want to stay on track to graduate. What should I focus on right now?' },
]

export const FALLBACK_STAFF_LAUNCH_CARDS: HubLaunchCard[] = [
  { label: 'Help me build a plan', hint: 'Turn a goal into steps people can follow', first_message: 'Help me build a plan. I want to turn a goal into clear steps the people I work with can follow.' },
  { label: 'What needs my attention?', hint: "Work waiting on you and anyone who's stuck", first_message: 'What needs my attention right now? Show me work waiting on me and anyone who might be stuck.' },
  { label: 'Draft a message', hint: 'Reminders, announcements and check-ins', first_message: "Help me draft a message to the people I'm working with." },
  { label: 'Find something to share', hint: 'Videos, guides and tools for your group', first_message: "Help me find a good resource to share with the people I'm working with." },
]

export const fallbackLaunchCards = (audience: LaunchCardAudience) => (audience === 'staff' ? FALLBACK_STAFF_LAUNCH_CARDS : FALLBACK_LAUNCH_CARDS)

export const usableLaunchCards = (cards: unknown): HubLaunchCard[] =>
  Array.isArray(cards) ? cards.filter((card): card is HubLaunchCard => Boolean(card?.label && card?.first_message)) : []

// Returns the problem with a draft card set, or null when it can be saved.
export function launchCardsProblem(cards: HubLaunchCard[]): string | null {
  if (cards.length < 1) return 'Keep at least one card.'
  if (cards.length > MAX_LAUNCH_CARDS) return `Use at most ${MAX_LAUNCH_CARDS} cards.`
  if (cards.some((card) => !card.label.trim() || !card.first_message.trim())) return 'Every card needs a title and an opening message.'
  return null
}
