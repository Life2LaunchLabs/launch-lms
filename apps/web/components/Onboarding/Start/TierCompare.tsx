'use client'

import React from 'react'
import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

import { tr } from '@/lib/tr'
import { inOrgWords } from '@/lib/people'
/** The same tiers as the for-organizations page, side by side while someone decides about the trial. */
const TIERS = [
  { name: 'Free', get blurb() { return tr('onboarding.tier_compare.for_one_person_helping_a', 'For one person helping a few learners.') }, get items() { return [inOrgWords('25 active learners'), '2 staff', 'Build plans or add them from Discover', inOrgWords('A feed with every learner’s work'), 'Requirements and coverage reports', inOrgWords('Badges learners keep')] } },
  { name: 'Full', get blurb() { return tr('onboarding.tier_compare.for_programs_with_groups_and', 'For programs with groups and several staff.') }, get items() { return [inOrgWords('200 active learners'), '12 staff', 'Groups, group plans and group chats', 'Bulk invites by email list or CSV', 'Everything in Free'] }, featured: true },
  { name: 'Enterprise', get blurb() { return tr('onboarding.tier_compare.for_schools_districts_and_employers', 'For schools, districts and employers at scale.') }, get items() { return [inOrgWords('Unlimited learners and staff'), 'Single sign-on', 'Advanced reporting', 'Audit logs and API access', 'Everything in Full'] } },
]

export default function TierCompare() {
  return <div className="flex h-full w-full flex-col justify-center gap-4">
    <div className="grid gap-3 md:grid-cols-3">
      {TIERS.map((tier, index) => <motion.div key={tier.name} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }}
        className={cn('relative rounded-2xl border bg-white p-4', tier.featured ? 'border-violet-400 shadow-[0_18px_50px_rgba(107,63,224,0.18)]' : 'border-border')}>
        {tier.featured ? <span className="absolute -top-2.5 left-4 rounded-full bg-violet-600 px-2.5 py-0.5 text-[11px] font-bold text-white">{tr('onboarding.tier_compare.try_it_30_days', 'Try it 30 days')}</span> : null}
        <h3 className="text-lg font-black">{tier.name}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{tier.blurb}</p>
        <ul className="mt-3 space-y-1.5">{tier.items.map((item) => <li key={item} className="flex gap-1.5 text-[12.5px]"><Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />{item}</li>)}</ul>
      </motion.div>)}
    </div>
    <div className="grid gap-3 text-[12.5px] text-muted-foreground md:grid-cols-2">
      <p><b className="block text-foreground">{tr('onboarding.tier_compare.upgrading_is_a_request', 'Upgrading is a request')}</b>{tr('onboarding.tier_compare.there_s_no_checkout_ask', 'There’s no checkout. Ask for Full or Enterprise from your dashboard and we’ll turn it on.')}</p>
      <p><b className="block text-foreground">{tr('onboarding.tier_compare.when_the_trial_ends', 'When the trial ends')}</b>{tr('onboarding.tier_compare.you_re_back_on_free', 'You’re back on Free unless you’ve asked for Full. Nothing is deleted.')}</p>
    </div>
  </div>
}
