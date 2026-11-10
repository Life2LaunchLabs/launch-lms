import React from 'react'
import { ArrowRight } from 'lucide-react'
import { tr } from '@/lib/tr'

/**
 * Where someone here for themselves goes from /start: /welcome sends a signed-in learner to their own
 * space (their first phase, or Goals when they already have a plan) and anyone else to sign up.
 */
export const PLANNING_FOR_MYSELF_HREF = '/welcome'

/** The way out of the role step for a learner: every role there is someone who guides others. */
export default function PlanningForMyself() {
  return <p className="mt-5 text-center text-[13px] text-muted-foreground">
    {tr('onboarding.start_flow.planning_for_yourself', 'Planning your own future?')}{' '}
    <a data-planning-for-myself href={PLANNING_FOR_MYSELF_HREF} className="inline-flex items-center gap-1 font-bold text-foreground underline underline-offset-4">
      {tr('onboarding.start_flow.go_to_your_own_space', 'Go to your own space')}<ArrowRight size={13} aria-hidden="true" />
    </a>
  </p>
}
