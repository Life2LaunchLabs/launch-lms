'use client'

import React from 'react'
import { Button } from '@components/ui/button'
import { Checkbox } from '@components/ui/checkbox'
import EditSheet from '@components/Goals/edit/EditSheet'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import type { BlindPlan } from '@services/connect/connect'

/**
 * Before a message points to your plan from elsewhere: who here should be able to see it.
 * Everyone who can't yet starts ticked; untick to share with just some of them, or send
 * without sharing and they'll see a private plan.
 */
export default function ShareSheet({ asking, onClose, onSend }: {
  asking: { body: string; plans: BlindPlan[] } | null
  onClose: () => void
  // eslint-disable-next-line no-unused-vars
  onSend: (share: Record<string, string[]>) => Promise<void>
}) {
  const [picked, setPicked] = React.useState<Record<string, string[]>>({})
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    setPicked(Object.fromEntries((asking?.plans || []).filter((plan) => plan.how !== 'none').map((plan) => [plan.goal_uuid, plan.people.map((person) => person.user_uuid || '')])))
  }, [asking])
  const toggle = (goalUuid: string, userUuid: string, on: boolean) => setPicked((current) => ({
    ...current, [goalUuid]: on ? [...(current[goalUuid] || []), userUuid] : (current[goalUuid] || []).filter((item) => item !== userUuid),
  }))
  const go = async (share: Record<string, string[]>) => {
    setBusy(true)
    try { await onSend(share) } finally { setBusy(false) }
  }
  const any = Object.values(picked).some((items) => items.length)
  const plans = asking?.plans || []
  return <EditSheet open={Boolean(asking)} onOpenChange={(next) => !next && onClose()} color="#7cc4ff"
    title={plans.length === 1 ? `Share ${plans[0].title}?` : 'Share these plans?'}
    description="It’s from outside this chat, so not everyone here can see it yet."
    footer={<>
      <Button variant="ghost" disabled={busy} onClick={() => go({})}>Send without sharing</Button>
      <Button disabled={busy || !any} onClick={() => go(picked)}>Share and send</Button>
    </>}>
    {plans.map((plan) => <div key={plan.goal_uuid} className="space-y-2">
      {plans.length > 1 ? <h3 className="text-sm font-bold">{plan.title}</h3> : null}
      {plan.how === 'none' ? <p className="text-sm text-muted-foreground">You can&rsquo;t share this plan. They&rsquo;ll see that it&rsquo;s private.</p> : <>
        <p className="text-sm text-muted-foreground">{plan.how === 'request' ? 'Ask the plan’s admins to let these people see it:' : 'Let these people see it:'}</p>
        <ul className="space-y-1.5">{plan.people.map((person) => <li key={person.user_uuid}>
          <label className="flex items-center gap-3 rounded-xl px-1 py-1">
            <Checkbox checked={(picked[plan.goal_uuid] || []).includes(person.user_uuid || '')} onCheckedChange={(value) => toggle(plan.goal_uuid, person.user_uuid || '', value === true)} />
            <PersonAvatar user={person as any} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{person.name} <span className="font-normal text-muted-foreground">@{person.username}</span></span>
          </label>
        </li>)}</ul>
      </>}
    </div>)}
  </EditSheet>
}
