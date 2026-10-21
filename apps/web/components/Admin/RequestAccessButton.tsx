'use client'
import React, { useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getOrgPlanRequests, submitPlanRequest, type PlanRequest } from '@services/plans/plan_requests'
import { accessRequestLabel, type AccessRequest } from '@services/plans/plans'
import { cn } from '@/lib/utils'

export { accessRequestLabel }

/** Tiers, partner programs and on-request features are request-only: this files the request (the same one Plan & access files) and then shows it pending. */
export default function RequestAccessButton({ request, tone = 'light', className }: { request: AccessRequest; tone?: 'light' | 'dark'; className?: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const orgslug = org?.slug
  const [sending, setSending] = useState(false)
  const { data: requests, mutate } = useSWR<PlanRequest[]>(
    token && orgslug ? `plan-requests-${orgslug}` : null,
    () => getOrgPlanRequests(orgslug, token),
    { revalidateOnFocus: false }
  )
  const pending = requests?.some((item) => item.request_type === request.type && item.requested_value === request.value && item.status === 'pending')
  const label = accessRequestLabel(request)

  const send = async (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setSending(true)
    try {
      await submitPlanRequest(orgslug, request.type, request.value, null, token)
      toast.success(`Requested ${label}.`)
      mutate()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send the request.')
    } finally {
      setSending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={pending || sending || !token}
      title={pending ? `${label} requested` : `Request ${label}`}
      aria-label={pending ? `${label} requested` : `Request ${label}`}
      className={cn(
        'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:cursor-default',
        tone === 'dark'
          ? 'bg-white/[0.08] text-white/70 hover:bg-white/[0.14] hover:text-white disabled:bg-transparent disabled:text-white/40'
          : 'bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-500',
        className
      )}
    >
      {pending ? 'Requested' : 'Request'}
    </button>
  )
}
