'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Mail, RotateCw, X } from 'lucide-react'
import { getAPIUrl } from '@services/config/config'
import { resendUserInvitation, revokeUserInvitation } from '@services/organizations/invites'
import { swrFetcher } from '@services/utils/ts/requests'
import { usePeopleContext } from './usePeople'

/** Invitations nobody has accepted yet, for admins to resend or take back. With `empty`, it sits in a card (no heading) and says so when there are none. */
export default function PendingInvites({ empty }: { empty?: string } = {}) {
  const { orgId, token } = usePeopleContext()
  const { data, mutate } = useSWR(orgId && token ? `${getAPIUrl()}orgs/${orgId}/invites/users` : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: false })
  const pending = ((data || []) as any[]).filter((invite) => invite.pending)
  const [busy, setBusy] = React.useState('')
  if (!pending.length) return empty && data ? <p className="text-sm text-muted-foreground">{empty}</p> : null

  const act = async (invitationUuid: string, resend: boolean) => {
    if (!token || busy) return
    if (!resend && !confirm('Take back this invitation?')) return
    setBusy(invitationUuid)
    try {
      const response = resend ? await resendUserInvitation(orgId, invitationUuid, token) : await revokeUserInvitation(orgId, invitationUuid, token)
      if (!response.success) throw new Error(response.data?.detail || 'That didn’t work')
      toast.success(resend ? 'Invitation sent again' : 'Invitation taken back')
      await mutate()
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t work')
    } finally {
      setBusy('')
    }
  }

  return <section aria-label="Invited" className={empty ? '' : 'mt-4'}>
    {empty ? null : <h2 className="px-2.5 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Invited</h2>}
    <ul className="flex flex-col gap-0.5">{pending.map((invite) => <li key={invite.invitation_uuid} className="flex items-center gap-3 rounded-2xl px-2.5 py-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Mail size={16} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{invite.email}</span>
        <span className="block truncate text-sm text-muted-foreground">{[invite.role?.name, invite.usergroup?.name].filter(Boolean).join(' · ') || 'Invited'}</span>
      </span>
      <button type="button" onClick={() => void act(invite.invitation_uuid, true)} disabled={Boolean(busy)} aria-label={`Resend the invitation to ${invite.email}`} title="Resend" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><RotateCw size={15} /></button>
      <button type="button" onClick={() => void act(invite.invitation_uuid, false)} disabled={Boolean(busy)} aria-label={`Take back the invitation to ${invite.email}`} title="Take back" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={15} /></button>
    </li>)}</ul>
  </section>
}
