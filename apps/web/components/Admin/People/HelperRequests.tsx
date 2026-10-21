'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Check, Loader2, UserRound, X } from 'lucide-react'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { chatTime } from '@components/Connect/ConnectView'
import { peopleApi, type HelperRequest } from '@services/school/people'
import { usePeopleContext } from './usePeople'

/**
 * A helper a learner asked for on one of the organization's plans, waiting on an admin (the
 * Organization tab's helper approval). It shows as a card in that person's conversation in People,
 * with Approve and Decline for admins; the same endpoints as before.
 */
export default function HelperRequestCard({ request, canDecide, onDecided }: { request: HelperRequest; canDecide: boolean; onDecided: () => unknown }) {
  const { orgId, token } = usePeopleContext()
  const [busy, setBusy] = React.useState<'' | 'approve' | 'decline'>('')
  const who = request.helper?.name || request.email
  const decide = async (approve: boolean) => {
    setBusy(approve ? 'approve' : 'decline')
    try {
      await peopleApi.decideHelper(orgId, request.invitation_uuid, approve, token)
      toast.success(approve ? 'Approved. They’ve been sent the invitation.' : 'Declined')
      await onDecided()
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t save')
    } finally {
      setBusy('')
    }
  }
  return <article aria-label={`Helper request from ${who}`} className="flex gap-3 rounded-2xl border border-amber-300/70 bg-amber-50/60 p-4 dark:bg-amber-500/10">
    {request.helper ? <PersonAvatar user={request.helper as any} size="sm" />
      : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><UserRound size={16} /></span>}
    <div className="min-w-0 flex-1">
      <p className="text-sm font-bold text-foreground">
        {who} is asking to help on {request.learner?.name ? `${request.learner.name}’s` : 'a'} plan &ldquo;{request.goal.title}&rdquo;
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {request.role ? `As ${request.role.name.toLowerCase()}` : 'As a helper'}{request.invited_by && request.invited_by.id !== request.learner?.id ? `, asked by ${request.invited_by.name}` : ''} · {chatTime(request.creation_date)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">They join the plan only once an admin approves.</p>
      {canDecide ? <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void decide(false)} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-xs font-bold disabled:opacity-50">
          {busy === 'decline' ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}Decline
        </button>
        <button type="button" onClick={() => void decide(true)} disabled={Boolean(busy)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-bold text-background disabled:opacity-50">
          {busy === 'approve' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Approve
        </button>
      </div> : <p className="mt-2 text-xs font-semibold text-muted-foreground">An admin approves helpers.</p>}
    </div>
  </article>
}
