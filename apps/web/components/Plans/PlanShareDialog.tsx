'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Loader2, LogOut, Mail, X } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { planningApi } from '@services/planning/planning'
import { PersonAvatar } from './PlanEditorShared'

const ROLE_HINTS: Record<string, string> = {
  viewer: 'Sees the plan and how it’s going.',
  reviewer: 'Can comment, help fill in steps, and sign them off.',
  plan_admin: 'Can also change the plan and who it’s shared with.',
}

// eslint-disable-next-line no-unused-vars
type Props = { detail: any; token?: string; refresh(): Promise<any> | void; onLeft(): void; open: boolean; setOpen(open: boolean): void }

/** Who a plan is shared with, and adding, changing or taking back access. */
export default function PlanShareDialog({ detail, token, refresh, onLeft, open, setOpen }: Props) {
  const session = useLHSession() as any
  const viewerId = session?.data?.user?.id
  const canManage = detail.capabilities.includes('manage_collaborators')
  const canRequest = !canManage && detail.capabilities.includes('request_collaborators')
  const isAdmin = detail.is_owner || detail.viewer_role?.key === 'plan_admin'
  const roles = (detail.roles || []).filter((role: any) => role.key !== 'subject' && (role.key !== 'plan_admin' || isAdmin))
  const [email, setEmail] = React.useState('')
  const [roleKey, setRoleKey] = React.useState('reviewer')
  const [busy, setBusy] = React.useState<string | null>(null)
  React.useEffect(() => { if (roles.length && !roles.some((role: any) => role.key === roleKey)) setRoleKey(roles[0].key) }, [roles, roleKey])

  const people = (detail.collaborators || []).slice().sort((a: any, b: any) => Number(b.is_owner) - Number(a.is_owner) || Number(b.is_subject) - Number(a.is_subject))
  const pending = (detail.invitations || []).filter((item: any) => item.status === 'pending' && item.kind === 'collaborator')
  const run = async (key: string, action: () => Promise<any>, done?: string) => {
    setBusy(key)
    try { await action(); await refresh(); if (done) toast.success(done) } catch (error: any) { toast.error(error?.message || 'That didn’t work. Try again.') } finally { setBusy(null) }
  }
  const share = () => {
    const address = email.trim()
    if (!address) return
    void run('share', async () => {
      if (canManage) await planningApi.invite(detail.slug, { email: address, role_key: roleKey, kind: 'collaborator' }, token)
      else await planningApi.requestCollaborator(detail.slug, { email: address, role_key: roleKey }, token)
      setEmail('')
    }, canManage ? `Invited ${address}.` : 'Sent. Your school will approve it.')
  }
  const leave = () => {
    if (!window.confirm('Leave this plan? You’ll lose access to it.')) return
    void run('leave', async () => { await planningApi.leave(detail.slug, token); setOpen(false); onLeft() }, 'You left the plan.')
  }
  const me = people.find((person: any) => person.user?.id === viewerId)

  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle={`Share “${detail.name}”`} dialogDescription={canManage ? 'Invite people by email. They get a message and a link to accept.' : canRequest ? 'Your school approves who joins plans it handed out.' : 'People who can see this plan.'} dialogContent={<div className="space-y-5 p-2">
    {canManage || canRequest ? <div className="space-y-2">
      <div className="flex gap-2">
        <label className="min-w-0 flex-1"><span className="sr-only">Email</span><input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') share() }} placeholder="name@example.com" className="h-10 w-full rounded-lg border border-border px-3 text-sm" /></label>
        <label><span className="sr-only">Access</span><select value={roleKey} onChange={(event) => setRoleKey(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-xs font-bold">{roles.map((role: any) => <option key={role.key} value={role.key}>{role.name}</option>)}</select></label>
        <button type="button" disabled={busy === 'share' || !email.trim()} onClick={share} className="flex h-10 items-center gap-1.5 rounded-lg bg-foreground px-4 text-xs font-black text-background disabled:opacity-40">{busy === 'share' ? <Loader2 size={14} className="animate-spin" /> : null}{canManage ? 'Invite' : 'Ask'}</button>
      </div>
      {ROLE_HINTS[roleKey] ? <p className="text-[11px] text-muted-foreground">{roles.find((role: any) => role.key === roleKey)?.name}: {ROLE_HINTS[roleKey]}</p> : null}
    </div> : null}

    <section>
      <h3 className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">People with access</h3>
      <ul className="mt-2 divide-y divide-border">
        {people.map((person: any) => {
          const fixed = person.is_owner || person.is_subject || !canManage
          return <li key={person.collaborator_uuid} className="flex items-center gap-2.5 py-2">
            <PersonAvatar user={person.user} />
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{person.user?.name}{person.user?.id === viewerId ? ' (you)' : ''}</span>{person.user?.email ? <span className="block truncate text-[10px] text-muted-foreground">{person.user.email}</span> : null}</span>
            {fixed ? <span className="text-[11px] font-bold text-muted-foreground">{person.is_owner ? 'Owner' : person.is_subject ? 'Their plan' : person.role?.name}</span> : <>
              <label><span className="sr-only">Access for {person.user?.name}</span><select value={person.role?.key} disabled={busy === person.collaborator_uuid} onChange={(event) => void run(person.collaborator_uuid, () => planningApi.updateCollaborator(detail.slug, person.collaborator_uuid, event.target.value, token))} className="h-8 rounded-lg border border-border bg-background px-1.5 text-[11px] font-bold">{roles.map((role: any) => <option key={role.key} value={role.key}>{role.name}</option>)}</select></label>
              <button type="button" aria-label={`Remove ${person.user?.name}`} disabled={busy === person.collaborator_uuid} onClick={() => { if (window.confirm(`Stop sharing with ${person.user?.name}?`)) void run(person.collaborator_uuid, () => planningApi.removeCollaborator(detail.slug, person.collaborator_uuid, token), 'Removed.') }} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700"><X size={14} /></button>
            </>}
          </li>
        })}
        {pending.map((invitation: any) => <li key={invitation.invitation_uuid} className="flex items-center gap-2.5 py-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Mail size={13} /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{invitation.email}</span><span className="block text-[10px] text-muted-foreground">Invited, hasn’t answered yet</span></span>
          <span className="text-[11px] font-bold text-muted-foreground">{invitation.role?.name}</span>
          {canManage ? <button type="button" aria-label={`Take back the invitation to ${invitation.email}`} disabled={busy === invitation.invitation_uuid} onClick={() => void run(invitation.invitation_uuid, () => planningApi.revokeInvitation(detail.slug, invitation.invitation_uuid, token), 'Invitation taken back.')} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700"><X size={14} /></button> : null}
        </li>)}
      </ul>
    </section>

    {me && !me.is_owner && !me.is_subject ? <button type="button" disabled={busy === 'leave'} onClick={leave} className="inline-flex items-center gap-1.5 text-xs font-black text-red-700"><LogOut size={13} />Leave this plan</button> : null}
  </div>} />
}
