'use client'

import React from 'react'
import useSWR, { mutate as mutateGlobal } from 'swr'
import toast from 'react-hot-toast'
import { Check, Loader2, LogOut, Mail, X } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { isGoalsKey } from '@services/goals/goals'
import { collaboratorRequestsKey, goalSharingApi, peopleKey, type CollaboratorRequest, type GoalCollaborator, type GoalPeople } from '@services/goals/sharing'
import type { Goal } from '@services/goals/types'
import { swrFetcher } from '@services/utils/ts/requests'
import { PersonAvatar } from './PersonAvatar'

const ROLE_HINTS: Record<string, string> = {
  viewer: 'Sees the goal and how it’s going.',
  reviewer: 'Can comment, help with steps, and sign them off.',
  plan_admin: 'Can also change the goal and who it’s shared with.',
}

const ownerFirst = (a: GoalCollaborator, b: GoalCollaborator) => Number(b.is_owner) - Number(a.is_owner) || Number(b.is_subject) - Number(a.is_subject)

// eslint-disable-next-line no-unused-vars
type Props = { goal: Goal; token?: string; open: boolean; setOpen: (open: boolean) => void; onLeft: () => void }

/** Who a goal is shared with, and adding, changing or taking back access. */
export default function GoalShareDialog({ goal, token, open, setOpen, onLeft }: Props) {
  const session = useLHSession() as any
  const viewerId = session?.data?.user?.id
  const g = goal.goal_uuid
  const { data: people, mutate: refreshPeople } = useSWR<GoalPeople>(open && token ? peopleKey(g) : null, (url: string) => swrFetcher(url, token))
  const capabilities = people?.capabilities || goal.capabilities
  const canManage = capabilities.includes('manage_collaborators')
  const canRequest = !canManage && capabilities.includes('request_collaborators')
  const { data: requests = [], mutate: refreshRequests } = useSWR<CollaboratorRequest[]>(open && token && canManage ? collaboratorRequestsKey(g) : null, (url: string) => swrFetcher(url, token))
  const members = (people?.collaborators || []).slice().sort(ownerFirst)
  const me = members.find((person) => person.user?.id === viewerId)
  const isAdmin = Boolean(people?.is_owner || me?.role.key === 'plan_admin')
  const roles = (people?.roles || []).filter((role) => role.key !== 'subject' && (role.key !== 'plan_admin' || isAdmin))
  const [email, setEmail] = React.useState('')
  const [roleKey, setRoleKey] = React.useState('reviewer')
  const [busy, setBusy] = React.useState<string | null>(null)
  React.useEffect(() => { if (roles.length && !roles.some((role) => role.key === roleKey)) setRoleKey(roles[0].key) }, [roles, roleKey])

  const pending = (people?.invitations || []).filter((item) => item.status === 'pending' && item.kind === 'collaborator')
  const waiting = requests.filter((item) => item.status === 'pending')
  const transferable = people?.is_owner && goal.ownership === 'personal' ? members.filter((person) => !person.is_owner && person.collaborator_uuid && person.user) : []
  const run = async (key: string, action: () => Promise<unknown>, done?: string) => {
    setBusy(key)
    try {
      await action()
      await Promise.all([refreshPeople(), canManage ? refreshRequests() : null])
      if (done) toast.success(done)
    } catch (error: any) { toast.error(error?.message || 'That didn’t work. Try again.') } finally { setBusy(null) }
  }
  const share = () => {
    const address = email.trim()
    if (!address) return
    void run('share', async () => {
      if (canManage) await goalSharingApi.invite(g, { email: address, role_key: roleKey, kind: 'collaborator' }, token)
      else await goalSharingApi.requestCollaborator(g, { email: address, role_key: roleKey }, token)
      setEmail('')
    }, canManage ? `Invited ${address}.` : 'Sent. Your school will approve it.')
  }
  const leave = () => {
    if (!window.confirm('Leave this goal? You’ll lose access to it.')) return
    void run('leave', async () => { await goalSharingApi.leave(g, token); await mutateGlobal(isGoalsKey); setOpen(false); onLeft() }, 'You left the goal.')
  }
  const transfer = (userId: number, name?: string) => {
    if (!window.confirm(`Make ${name || 'them'} the owner? You stay on as a goal admin.`)) return
    void run('transfer', async () => { await goalSharingApi.transferOwnership(g, userId, token); await mutateGlobal(isGoalsKey) }, 'Ownership transferred.')
  }
  // eslint-disable-next-line no-unused-vars
  const roleSelect = (value: string, onChange: (key: string) => void, label: string, disabled = false, small = false) => <label><span className="sr-only">{label}</span>
    <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={small ? 'h-8 rounded-lg border border-border bg-background px-1.5 text-[11px] font-bold' : 'h-10 rounded-lg border border-border bg-background px-2 text-xs font-bold'}>{roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</select>
  </label>
  const removeButton = (label: string, disabled: boolean, onClick: () => void) => <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700"><X size={14} /></button>

  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle={`Share “${goal.title}”`} dialogDescription={canManage ? 'Invite people by email. They get a message and a link to accept.' : canRequest ? 'Your school approves who joins goals it handed out.' : 'People who can see this goal.'} dialogContent={<div className="space-y-5 p-2">
    {canManage || canRequest ? <div className="space-y-2">
      <div className="flex gap-2">
        <label className="min-w-0 flex-1"><span className="sr-only">Email</span><input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') share() }} placeholder="name@example.com" className="h-10 w-full rounded-lg border border-border px-3 text-sm" /></label>
        {roleSelect(roleKey, setRoleKey, 'Access')}
        <button type="button" disabled={busy === 'share' || !email.trim()} onClick={share} className="flex h-10 items-center gap-1.5 rounded-lg bg-foreground px-4 text-xs font-black text-background disabled:opacity-40">{busy === 'share' ? <Loader2 size={14} className="animate-spin" /> : null}{canManage ? 'Invite' : 'Ask'}</button>
      </div>
      {ROLE_HINTS[roleKey] ? <p className="text-[11px] text-muted-foreground">{roles.find((role) => role.key === roleKey)?.name}: {ROLE_HINTS[roleKey]}</p> : null}
    </div> : null}

    {waiting.length ? <section>
      <h3 className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Asked to join</h3>
      <ul className="mt-2 divide-y divide-border">{waiting.map((item) => <li key={item.request_uuid} className="flex items-center gap-2.5 py-2">
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{item.email}</span><span className="block truncate text-[10px] text-muted-foreground">{item.requested_by?.name ? `Asked by ${item.requested_by.name}` : 'Waiting for approval'}{item.message ? ` · ${item.message}` : ''}</span></span>
        <span className="text-[11px] font-bold text-muted-foreground">{people?.roles.find((role) => role.key === item.role_key)?.name || item.role_key}</span>
        <button type="button" aria-label={`Approve ${item.email}`} disabled={busy === item.request_uuid} onClick={() => void run(item.request_uuid, () => goalSharingApi.respondCollaboratorRequest(g, item.request_uuid, true, token), `Invited ${item.email}.`)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-green-50 hover:text-green-700"><Check size={14} /></button>
        {removeButton(`Decline ${item.email}`, busy === item.request_uuid, () => void run(item.request_uuid, () => goalSharingApi.respondCollaboratorRequest(g, item.request_uuid, false, token), 'Declined.'))}
      </li>)}</ul>
    </section> : null}

    <section>
      <h3 className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">People with access</h3>
      {!people ? <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div> : <ul className="mt-2 divide-y divide-border">
        {members.map((person) => {
          const uuid = person.collaborator_uuid
          const fixed = !uuid || person.is_owner || person.is_subject || !canManage
          return <li key={uuid || `owner-${person.user?.id}`} className="flex items-center gap-2.5 py-2">
            <PersonAvatar user={person.user} />
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{person.user?.name}{person.user?.id === viewerId ? ' (you)' : ''}</span>{person.user?.email ? <span className="block truncate text-[10px] text-muted-foreground">{person.user.email}</span> : null}</span>
            {fixed ? <span className="text-[11px] font-bold text-muted-foreground">{person.is_owner ? 'Owner' : person.is_subject ? 'Their goal' : person.role.name}</span> : <>
              {roleSelect(person.role.key, (key) => void run(uuid, () => goalSharingApi.updateCollaborator(g, uuid, key, token)), `Access for ${person.user?.name}`, busy === uuid, true)}
              {removeButton(`Remove ${person.user?.name}`, busy === uuid, () => { if (window.confirm(`Stop sharing with ${person.user?.name}?`)) void run(uuid, () => goalSharingApi.removeCollaborator(g, uuid, token), 'Removed.') })}
            </>}
          </li>
        })}
        {pending.map((invitation) => <li key={invitation.invitation_uuid} className="flex items-center gap-2.5 py-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Mail size={13} /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{invitation.email}</span><span className="block text-[10px] text-muted-foreground">Invited, hasn’t answered yet</span></span>
          <span className="text-[11px] font-bold text-muted-foreground">{invitation.role?.name}</span>
          {canManage ? removeButton(`Take back the invitation to ${invitation.email}`, busy === invitation.invitation_uuid, () => void run(invitation.invitation_uuid, () => goalSharingApi.revokeInvitation(g, invitation.invitation_uuid, token), 'Invitation taken back.')) : null}
        </li>)}
      </ul>}
    </section>

    {transferable.length ? <label className="block text-[11px] font-bold text-muted-foreground">Make someone else the owner
      <select value="" disabled={busy === 'transfer'} onChange={(event) => { const person = transferable.find((item) => String(item.user?.id) === event.target.value); if (person?.user) transfer(person.user.id, person.user.name) }} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-xs font-bold">
        <option value="">Choose a person…</option>
        {transferable.map((person) => <option key={person.collaborator_uuid} value={String(person.user?.id)}>{person.user?.name}</option>)}
      </select>
    </label> : null}

    {me && !me.is_owner && !me.is_subject ? <button type="button" disabled={busy === 'leave'} onClick={leave} className="inline-flex items-center gap-1.5 text-xs font-black text-red-700"><LogOut size={13} />Leave this goal</button> : null}
  </div>} />
}
