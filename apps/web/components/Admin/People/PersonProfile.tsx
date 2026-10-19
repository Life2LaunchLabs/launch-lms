'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, Loader2, MessageCircle, UserRound, X } from 'lucide-react'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { LearnerRequirementTree } from '@components/Goals/admin/live/LearnerRequirements'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi } from '@services/connect/connect'
import { goalSharingApi } from '@services/goals/sharing'
import { peopleKeys, type Profile, type ProfilePlan } from '@services/school/people'
import IssueBadge from './IssueBadge'
import LearnerTeam from './LearnerTeam'
import PersonManage from './PersonManage'
import { RoleTag } from './PeopleList'
import { usePeopleContext, useProfile } from './usePeople'

const admin = routePaths.org.admin

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'
}

/** Someone's page in People: who they are here, their plans and the feed for each, who helps them, and what admins can change. */
export default function PersonProfile({ orgslug, username }: { orgslug: string; username: string }) {
  const { orgId, token } = usePeopleContext()
  const { data: profile, error, isLoading, mutate } = useProfile(username)
  const listHref = getUriWithOrg(orgslug, admin.people.root())

  if (isLoading) return <div className="m-auto"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (error || !profile) return <div className="m-auto max-w-sm p-8 text-center">
    <UserRound className="mx-auto mb-3 text-muted-foreground" size={36} />
    <p className="text-sm text-muted-foreground">{error?.message || 'They’re not in this organization.'}</p>
    <Link href={listHref} className="mt-3 inline-block text-sm font-semibold underline">Back to People</Link>
  </div>

  const { user } = profile
  const learner = profile.role === 'learner'
  return <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f8f8]">
    <header className="flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-4 md:px-6">
      <Link href={listHref} aria-label="Back to People" className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted md:hidden"><ArrowLeft size={18} /></Link>
      <PersonAvatar user={user as any} size="md" />
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 text-xl font-black tracking-tight"><span className="truncate">{user.name}</span><RoleTag role={profile.role} /></h1>
        <p className="truncate text-sm text-muted-foreground">@{user.username}{profile.role_name ? ` · ${profile.role_name}` : ''}</p>
      </div>
      <MessageButton orgslug={orgslug} profile={profile} />
    </header>
    <div className="grid items-start gap-5 p-4 md:p-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
      <div className="space-y-5">
        {profile.role !== 'helper' ? <Plans orgslug={orgslug} plans={profile.plans} /> : null}
        {learner ? <section aria-label="Requirements" className="space-y-2"><h2 className="px-1 text-sm font-bold text-gray-900">Requirements</h2><LearnerRequirementTree orgId={orgId} userId={user.id} token={token} /></section> : null}
        {profile.helping_on.length ? <section className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
          <h2 className="text-sm font-bold text-gray-900">Helping on</h2>
          <p className="mt-1 text-xs text-gray-500">A learner brought them onto these plans. They see only these plans, and are reached only in each plan&rsquo;s feed.</p>
          <ul className="mt-3 space-y-2">{profile.helping_on.map((item) => <li key={item.collaborator_uuid} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate"><span className="font-semibold">{item.title}</span>{item.learner ? <span className="text-gray-500"> · {item.learner.name}</span> : null}</span>
            <Link href={getUriWithOrg(orgslug, admin.learnerFeed(item.goal_uuid))} className="shrink-0 text-xs font-bold underline">Open feed</Link>
          </li>)}</ul>
        </section> : null}
        {profile.helpers.length ? <Helpers profile={profile} refresh={mutate} /> : null}
      </div>
      <div className="space-y-5">
        <section className="grid gap-3 rounded-xl border border-gray-100 bg-white p-5 nice-shadow sm:grid-cols-2">
          {user.email ? <Detail label="Email" value={user.email} /> : null}
          <Detail label="Role" value={profile.org_role?.name || (profile.role === 'helper' ? 'Helper on a plan' : '—')} />
          <Detail label="Joined" value={formatDate(profile.joined_at)} />
          {profile.groups.length ? <Detail label="Groups" value={profile.groups.map((group) => group.as === 'staff' ? `${group.name} (staff)` : group.name).join(', ')} /> : null}
        </section>
        <PersonManage orgslug={orgslug} profile={profile} refresh={mutate} />
        {learner ? <LearnerTeam orgId={orgId} userId={user.id} token={token} /> : null}
        {profile.role !== 'helper' && profile.manage.change_role ? <IssueBadge user={user} orgId={orgId} token={token} /> : null}
      </div>
    </div>
  </div>
}

function MessageButton({ orgslug, profile }: { orgslug: string; profile: Profile }) {
  const { token, orgId } = usePeopleContext()
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const [opening, setOpening] = React.useState(false)
  if (!profile.can_message) return profile.note ? <p className="w-full text-xs text-muted-foreground md:w-auto md:max-w-xs md:text-right">{profile.note}</p> : null
  const open = async () => {
    if (profile.chat_uuid) return router.push(getUriWithOrg(orgslug, admin.people.chat(profile.chat_uuid)))
    setOpening(true)
    try {
      const chat = await connectApi.openDirect({ user_uuid: profile.user.user_uuid }, token)
      void mutate(peopleKeys.chats(orgId))
      router.push(getUriWithOrg(orgslug, admin.people.chat(chat.conversation_uuid)))
    } catch (error: any) {
      toast.error(error?.message || 'That chat couldn’t open')
      setOpening(false)
    }
  }
  return <button type="button" onClick={() => void open()} disabled={opening} className="inline-flex h-9 items-center gap-2 rounded-xl bg-foreground px-3.5 text-sm font-semibold text-background disabled:opacity-60">
    {opening ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}Message
  </button>
}

const STATUS: Record<string, string> = { draft: 'Being set up', pending: 'Not accepted yet', active: 'Active', finished: 'Finished', archived: 'Archived' }

function Plans({ orgslug, plans }: { orgslug: string; plans: ProfilePlan[] }) {
  return <section aria-label="Plans" className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
    <h2 className="text-sm font-bold text-gray-900">Plans</h2>
    {plans.length ? <ul className="mt-3 divide-y divide-gray-100">{plans.map((plan) => {
      const { done, total, behind, submitted } = plan.progress
      return <li key={plan.goal_uuid} className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{plan.title}</p>
          <p className="text-xs text-gray-500">
            {STATUS[plan.status] || plan.status}{total ? ` · ${done} of ${total} done` : ''}{submitted ? ` · ${submitted} to review` : ''}
            {behind ? <span className="font-semibold text-red-600"> · {behind} behind</span> : null}
            {plan.assignment_uuid ? ' · Assigned' : plan.source === 'badge' ? ' · For a badge' : ''}
          </p>
          {total ? <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-[var(--org-primary-color)]" style={{ width: `${Math.round((done / total) * 100)}%` }} /></div> : null}
        </div>
        <Link href={getUriWithOrg(orgslug, admin.learnerFeed(plan.goal_uuid))} className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-800 hover:bg-gray-50">Open feed</Link>
      </li>
    })}</ul> : <p className="mt-2 text-xs text-gray-500">No plans here yet. Plans are given out from Assignments.</p>}
  </section>
}

function Helpers({ profile, refresh }: { profile: Profile; refresh: () => Promise<unknown> }) {
  const { token } = usePeopleContext()
  const [busy, setBusy] = React.useState('')
  const remove = async (goalUuid: string, collaboratorUuid: string, name: string) => {
    if (!confirm(`Take ${name} off this plan?`)) return
    setBusy(collaboratorUuid)
    try {
      await goalSharingApi.removeCollaborator(goalUuid, collaboratorUuid, token)
      toast.success(`${name} was taken off the plan`)
      await refresh()
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t work')
    } finally {
      setBusy('')
    }
  }
  return <section aria-label="Helpers" className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
    <h2 className="text-sm font-bold text-gray-900">Helpers</h2>
    <p className="mt-1 text-xs text-gray-500">People {profile.user.name} brought onto their plans, such as a parent. They see only that plan.</p>
    <ul className="mt-3 space-y-2">{profile.helpers.map((helper) => <li key={helper.collaborator_uuid} className="flex items-center gap-3">
      <PersonAvatar user={helper.user as any} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm"><span className="font-semibold">{helper.user?.name || 'Someone'}</span><span className="text-gray-500"> · {helper.role} on {helper.goal_title}</span></span>
      {profile.manage.remove_helper ? <button type="button" onClick={() => void remove(helper.goal_uuid, helper.collaborator_uuid, helper.user?.name || 'them')} disabled={Boolean(busy)}
        aria-label={`Take ${helper.user?.name || 'them'} off ${helper.goal_title}`} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900">{busy === helper.collaborator_uuid ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}</button> : null}
    </li>)}</ul>
  </section>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0">
    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
    <p className="truncate text-sm font-medium text-gray-800">{value}</p>
  </div>
}
