'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Check, Loader2, X } from 'lucide-react'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { peopleApi } from '@services/school/people'
import { useHelperRequests, usePeopleContext } from './usePeople'

/** Helpers learners asked for on the organization's plans, waiting on an admin (the Organization tab's helper approval). */
export default function HelperRequestsPanel() {
  const { orgId, token } = usePeopleContext()
  const { data, mutate } = useHelperRequests()
  const [busy, setBusy] = React.useState('')
  const requests = data?.requests || []
  if (!requests.length) return null

  const decide = async (invitationUuid: string, approve: boolean) => {
    setBusy(invitationUuid)
    try {
      await peopleApi.decideHelper(orgId, invitationUuid, approve, token)
      toast.success(approve ? 'Approved. They’ve been sent the invitation.' : 'Declined')
      await mutate()
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t save')
    } finally {
      setBusy('')
    }
  }

  return <section aria-label="Helpers to approve" className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
    <h2 className="text-sm font-bold text-gray-900">Helpers to approve</h2>
    <p className="mt-1 text-xs text-gray-500">Learners asked for these people on plans your organization gave them. They join the plan only once you approve.</p>
    <ul className="mt-3 divide-y divide-gray-100">{requests.map((request) => {
      const who = request.helper?.name || request.email
      return <li key={request.invitation_uuid} className="flex flex-wrap items-center gap-3 py-3">
        {request.helper ? <PersonAvatar user={request.helper as any} size="md" /> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{who}{request.role ? <span className="font-normal text-gray-500"> as {request.role.name.toLowerCase()}</span> : null}</p>
          <p className="truncate text-xs text-gray-500">On {request.learner?.name ? `${request.learner.name}’s` : 'a'} plan &ldquo;{request.goal.title}&rdquo;{request.invited_by && request.invited_by.id !== request.learner?.id ? `, asked by ${request.invited_by.name}` : ''}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void decide(request.invitation_uuid, false)} disabled={Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 disabled:opacity-50"><X size={14} />Decline</button>
          <button type="button" onClick={() => void decide(request.invitation_uuid, true)} disabled={Boolean(busy)} className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
            {busy === request.invitation_uuid ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Approve
          </button>
        </div>
      </li>
    })}</ul>
  </section>
}
