'use client'

import React from 'react'
import { motion } from 'motion/react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The same tiers as the for-organizations page, side by side while someone decides about the trial. */
const TIERS = [
  { name: 'Free', blurb: 'For one person helping a few learners.', items: ['25 active learners', '2 staff', 'Build plans or add them from Discover', 'A feed with every learner’s work', 'Requirements and coverage reports', 'Badges learners keep'] },
  { name: 'Full', blurb: 'For programs with groups and several staff.', items: ['200 active learners', '12 staff', 'Groups, group plans and group chats', 'Bulk invites by email list or CSV', 'Everything in Free'], featured: true },
  { name: 'Enterprise', blurb: 'For schools, districts and employers at scale.', items: ['Unlimited learners and staff', 'Single sign-on', 'Advanced reporting', 'Audit logs and API access', 'Everything in Full'] },
]

export default function TierCompare() {
  return <div className="flex h-full w-full flex-col justify-center gap-4">
    <div className="grid gap-3 md:grid-cols-3">
      {TIERS.map((tier, index) => <motion.div key={tier.name} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }}
        className={cn('relative rounded-2xl border bg-white p-4', tier.featured ? 'border-violet-400 shadow-[0_18px_50px_rgba(107,63,224,0.18)]' : 'border-border')}>
        {tier.featured ? <span className="absolute -top-2.5 left-4 rounded-full bg-violet-600 px-2.5 py-0.5 text-[11px] font-bold text-white">Try it 30 days</span> : null}
        <h3 className="text-lg font-black">{tier.name}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{tier.blurb}</p>
        <ul className="mt-3 space-y-1.5">{tier.items.map((item) => <li key={item} className="flex gap-1.5 text-[12.5px]"><Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />{item}</li>)}</ul>
      </motion.div>)}
    </div>
    <div className="grid gap-3 text-[12.5px] text-muted-foreground md:grid-cols-2">
      <p><b className="block text-foreground">Upgrading is a request</b>There’s no checkout. Ask for Full or Enterprise from your dashboard and we’ll turn it on.</p>
      <p><b className="block text-foreground">When the trial ends</b>You’re back on Free unless you’ve asked for Full. Nothing is deleted.</p>
    </div>
  </div>
}
