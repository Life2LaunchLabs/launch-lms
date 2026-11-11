'use client'

import React from 'react'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Button } from '@components/ui/button'
import useGoalInvitations, { type OrgGoalInvitation } from '@components/Hooks/useGoalInvitations'
import { isGoalsKey } from '@services/goals/goals'
import { goalSharingApi, myInvitationsKey, type ReceivedInvitation } from '@services/goals/sharing'
import { swrFetcher } from '@services/utils/ts/requests'

import { tr } from '@/lib/tr'
/** Invitations to work on someone's goal, and goals an organization handed the learner, answered here. */
export default function Invitations({ token }: { token?: string }) {
  const { data: invitations = [] } = useSWR<ReceivedInvitation[]>(token ? myInvitationsKey() : null, (url: string) => swrFetcher(url, token), { revalidateOnFocus: true })
  const [busy, setBusy] = React.useState('')
  const { invitations: orgGoals, respond: respondOrg } = useGoalInvitations()
  if (!invitations.length && !orgGoals.length) return null
  const answer = async (uuid: string, send: () => Promise<unknown>) => {
    setBusy(uuid)
    try { await send(); await mutate(isGoalsKey) } catch { toast.error(tr('goals.invitations.could_not_respond_to_this', 'Could not respond to this invitation')) } finally { setBusy('') }
  }
  const respond = (uuid: string, accept: boolean) => answer(uuid, () => goalSharingApi.respondInvitation(uuid, accept, token))
  const respondGoal = (goal: OrgGoalInvitation, accept: boolean) => answer(goal.goal_uuid, () => respondOrg(goal, accept))
  return <section aria-label={tr('goals.invitations.goal_invitations', 'Goal invitations')} className="flex flex-col gap-3">
    <h2 className="text-xl font-extrabold tracking-tight">{tr('goals.invitations.invitations', 'Invitations')}</h2>
    {orgGoals.map((goal) => <div key={goal.goal_uuid} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="font-bold">{goal.title}</p>
        <p className="text-sm text-muted-foreground">{goal.organization?.name || tr('goals.invitations.launch_lms', 'Life2Launch')}</p>
      </div>
      <Button size="sm" variant="ghost" disabled={busy === goal.goal_uuid} onClick={() => void respondGoal(goal, false)}>{tr('goals.invitations.decline', 'Decline')}</Button>
      <Button size="sm" variant="brand" disabled={busy === goal.goal_uuid} onClick={() => void respondGoal(goal, true)}>{tr('goals.invitations.accept', 'Accept')}</Button>
    </div>)}
    {invitations.map((invite) => <div key={invite.invitation_uuid} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="font-bold">{invite.goal.title}</p>
        <p className="text-sm text-muted-foreground">{invite.organization?.name || invite.invited_by?.name || invite.invited_by?.username || tr('goals.invitations.launch_lms', 'Life2Launch')}{invite.kind !== 'subject' ? tr('goals.invitations.help_as_name', ' · Help as {{name}}', { name: invite.role.name }) : ''}</p>
      </div>
      <Button size="sm" variant="ghost" disabled={busy === invite.invitation_uuid} onClick={() => void respond(invite.invitation_uuid, false)}>{tr('goals.invitations.decline', 'Decline')}</Button>
      <Button size="sm" variant="brand" disabled={busy === invite.invitation_uuid} onClick={() => void respond(invite.invitation_uuid, true)}>{tr('goals.invitations.accept', 'Accept')}</Button>
    </div>)}
  </section>
}
