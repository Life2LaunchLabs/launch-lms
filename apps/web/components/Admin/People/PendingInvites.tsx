'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Mail, RotateCw, ShieldCheck, X } from 'lucide-react'
import { getAPIUrl } from '@services/config/config'
import { resendUserInvitation, revokeUserInvitation, setInvitationPermissions } from '@services/organizations/invites'
import { PERMISSION_NAMES, type StaffPermission } from '@services/organizations/membership'
import { swrFetcher } from '@services/utils/ts/requests'
import StaffPermissionSwitches from './StaffPermissionSwitches'
import { usePeopleContext } from './usePeople'

/** Invitations nobody has accepted yet, for admins to resend, take back, or (staff) change what they'll be able to do. With `empty`, it sits in a card (no heading) and says so when there are none. */
export default function PendingInvites({ empty }: { empty?: string } = {}) {
  const { orgId, token, isOwnerAdmin } = usePeopleContext()
  const { data, mutate } = useSWR(orgId && token ? `${getAPIUrl()}orgs/${orgId}/invites/users` : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: false })
  const pending = ((data || []) as any[]).filter((invite) => invite.pending)
  const [busy, setBusy] = React.useState('')
  const [open, setOpen] = React.useState('')
  if (!pending.length) return empty && data ? <p className="text-sm text-muted-foreground">{empty}</p> : null

  const act = async (invitationUuid: string, resend: boolean) => {
    if (!token || busy) return
    if (!resend && !confirm('Take back this invitation?')) return
    setBusy(invitationUuid)
    try {
      const response = resend ? await resendUserInvitation(orgId, invitationUuid, token) : await revokeUserInvitation(orgId, invitationUuid, token)
      if (!response.success) throw new Error(response.data?.detail || 'That didn’t work')
      await mutate()
      if (resend && response.data?.email_sent === false) throw new Error(response.data?.detail || 'The email didn’t send')
      toast.success(resend ? 'Invitation sent again' : 'Invitation taken back')
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t work')
    } finally {
      setBusy('')
    }
  }

  const savePermissions = async (invitationUuid: string, permissions: StaffPermission[]) => {
    if (!token || busy) return
    setBusy(invitationUuid)
    try {
      const response = await setInvitationPermissions(orgId, invitationUuid, permissions, token)
      if (!response.success) throw new Error(response.data?.detail || 'That didn’t save')
      await mutate()
      toast.success('Permissions saved')
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t save')
    } finally {
      setBusy('')
    }
  }
  const subtitle = (invite: any) => {
    const parts = [invite.role?.name, invite.usergroup?.name]
    if (Array.isArray(invite.permissions)) parts.push(invite.permissions.length ? invite.permissions.map((key: StaffPermission) => PERMISSION_NAMES[key] || key).join(', ') : 'No permissions yet')
    return parts.filter(Boolean).join(' · ') || 'Invited'
  }

  return <section aria-label="Invited" className={empty ? '' : 'mt-4'}>
    {empty ? null : <h2 className="px-2.5 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Invited</h2>}
    <ul className="flex flex-col gap-0.5">{pending.map((invite) => <li key={invite.invitation_uuid} className="rounded-2xl px-2.5 py-2">
      <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Mail size={16} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{invite.email}</span>
        <span className="block truncate text-sm text-muted-foreground">{invite.delivery_status === 'delivery_failed' ? <span className="text-rose-600">Email didn’t send · resend it</span> : subtitle(invite)}</span>
      </span>
      {isOwnerAdmin && Array.isArray(invite.permissions) ? <button type="button" onClick={() => setOpen(open === invite.invitation_uuid ? '' : invite.invitation_uuid)} aria-expanded={open === invite.invitation_uuid}
        aria-label={`What ${invite.email} can do`} title="What they can do" className={`rounded-lg p-1.5 hover:bg-muted hover:text-foreground ${open === invite.invitation_uuid ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}><ShieldCheck size={15} /></button> : null}
      <button type="button" onClick={() => void act(invite.invitation_uuid, true)} disabled={Boolean(busy)} aria-label={`Resend the invitation to ${invite.email}`} title="Resend" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><RotateCw size={15} /></button>
      <button type="button" onClick={() => void act(invite.invitation_uuid, false)} disabled={Boolean(busy)} aria-label={`Take back the invitation to ${invite.email}`} title="Take back" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={15} /></button>
      </div>
      {open === invite.invitation_uuid && token ? <div className="mt-3 space-y-2">
        <StaffPermissionSwitches orgId={orgId} token={token} value={invite.permissions} disabled={Boolean(busy)} onChange={(next) => void savePermissions(invite.invitation_uuid, next)} />
        <p className="text-xs text-muted-foreground">They get these when they accept. You can change them any time after, from their profile.</p>
      </div> : null}
    </li>)}</ul>
  </section>
}
