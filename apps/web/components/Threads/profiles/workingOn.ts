import type { ProfilePlan } from '@services/school/people'

/** How long a finished plan stays under Working on when nothing else is in progress. */
export const RECENTLY_FINISHED_DAYS = 30

const CURRENT = new Set(['active', 'pending'])

/**
 * What a learner's profile shows under Working on (FEED-223): plans in progress, or, when there are none,
 * the plans they finished lately, so approving the last hand-in doesn't make the plan vanish.
 */
export function workingOn(plans: ProfilePlan[], now: Date = new Date()): { current: ProfilePlan[]; finished: ProfilePlan[] } {
  const current = plans.filter((plan) => CURRENT.has(plan.status))
  if (current.length) return { current, finished: [] }
  const since = now.getTime() - RECENTLY_FINISHED_DAYS * 24 * 60 * 60 * 1000
  const finished = plans.filter((plan) => plan.status === 'finished' && (!plan.finished_at || new Date(plan.finished_at).getTime() >= since))
  return { current, finished }
}
