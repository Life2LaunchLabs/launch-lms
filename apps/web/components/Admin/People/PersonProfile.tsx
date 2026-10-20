'use client'

import React from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Layers3, Loader2, MessageCircle, SlidersHorizontal, UserRound, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import ChatPane from '@components/Connect/ChatPane'
import EditSheet from '@components/Goals/edit/EditSheet'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { LearnerRequirementTree } from '@components/Goals/admin/live/LearnerRequirements'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { connectApi } from '@services/connect/connect'
import { goalSharingApi } from '@services/goals/sharing'
import type { Profile, ProfilePlan } from '@services/school/people'
import IssueBadge from './IssueBadge'
import LearnerTeam from './LearnerTeam'
import PersonManage from './PersonManage'
import { RoleTag } from './PeopleList'
import { usePersonTimeline } from './PersonActivity'
import { usePeopleContext, useProfile, useRefreshPeople } from './usePeople'

const admin = routePaths.org.admin

export type PersonTab = 'message' | 'plans'

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'
}

/** A person's page with a tab open: Message (the default) or Plans. */
export function personTabHref(orgslug: string, username: string, tab: PersonTab = 'message') {
  const href = admin.people.user(username)
  return getUriWithOrg(orgslug, tab === 'plans' ? `${href}?tab=plans` : href)
}

/**
 * Someone in People: who they are here (with their groups, and Manage for admins or Details for
 * staff, which hold their role, groups, helpers, school team and staff notes), then their
 * conversation with you, where what waits on you about them shows as cards, and their plans.
 */
export default function PersonProfile({ orgslug, username, tab = 'message' }: { orgslug: string; username: string; tab?: PersonTab }) {
  const { orgId, token } = usePeopleContext()
  const { data: profile, error, isLoading, mutate } = useProfile(username)
  const [details, setDetails] = React.useState(false)
  const listHref = getUriWithOrg(orgslug, admin.people.root())

  if (isLoading) return <div className="m-auto"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (error || !profile) return <div className="m-auto max-w-sm p-8 text-center">
    <UserRound className="mx-auto mb-3 text-muted-foreground" size={36} />
    <p className="text-sm text-muted-foreground">{error?.message || 'They’re not in this organization.'}</p>
    <Link href={listHref} className="mt-3 inline-block text-sm font-semibold underline">Back to People</Link>
  </div>

  const { user } = profile
  const learner = profile.role === 'learner'
  const canManage = profile.manage.change_role || profile.manage.remove || profile.manage.groups || profile.manage.remove_helper
  const planCount = profile.role === 'helper' ? profile.helping_on.length : profile.plans.length
  const subtitle = [`@${user.username}`, profile.role_name && profile.role !== 'helper' ? profile.role_name : '', user.email || ''].filter(Boolean).join(' · ')
  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="shrink-0 border-b border-border bg-background px-4 pt-4 md:px-6">
      <div className="flex items-start gap-3">
        <Link href={listHref} aria-label="Back to People" className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-muted md:hidden"><ArrowLeft size={18} /></Link>
        <PersonAvatar user={user as any} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xl font-black tracking-tight"><span className="min-w-0 max-w-full truncate">{user.name}</span><RoleTag role={profile.role} /></h1>
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
          {profile.groups.length ? <div className="mt-2 flex flex-wrap gap-1.5">{profile.groups.map((group) => <Link key={`${group.as}-${group.id}`} href={getUriWithOrg(orgslug, admin.people.group(group.id))}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-semibold hover:bg-muted"><Users size={12} />{group.name}{group.as === 'staff' ? <span className="font-normal text-muted-foreground">· staff</span> : null}</Link>)}</div> : null}
        </div>
        <button type="button" onClick={() => setDetails(true)} aria-haspopup="dialog" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted">
          <SlidersHorizontal size={15} /><span className="hidden sm:inline">{canManage ? 'Manage' : 'Details'}</span><span className="sr-only sm:hidden">{canManage ? 'Manage' : 'Details'}</span>
        </button>
      </div>
      <nav aria-label={`${user.name}`} className="mt-3 flex gap-1">
        <TabLink href={personTabHref(orgslug, user.username)} current={tab === 'message'} icon={<MessageCircle size={15} />}>Message</TabLink>
        <TabLink href={personTabHref(orgslug, user.username, 'plans')} current={tab === 'plans'} icon={<Layers3 size={15} />}>Plans · {planCount}</TabLink>
      </nav>
    </header>
    {tab === 'plans' ? <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#f8f8f8] p-4 dark:bg-background md:p-6">
      {profile.role === 'helper' ? <HelpingOn orgslug={orgslug} profile={profile} /> : <Plans orgslug={orgslug} plans={profile.plans} staff={!learner} />}
      {learner ? <section aria-label="Requirements" className="space-y-2"><h2 className="px-1 text-sm font-bold text-gray-900">Requirements</h2><LearnerRequirementTree orgId={orgId} userId={user.id} token={token} /></section> : null}
    </div> : <PersonMessage key={user.username} orgslug={orgslug} profile={profile} />}
    <EditSheet open={details} onOpenChange={setDetails} color="#7cc4ff" title={user.name} description={canManage ? 'Their details, and what you can change about them here.' : 'Their details, school team and staff notes.'}>
      <section className="grid gap-3 rounded-xl border border-gray-100 bg-white p-5 nice-shadow sm:grid-cols-2">
        {user.email ? <Detail label="Email" value={user.email} /> : null}
        <Detail label="Role" value={profile.org_role?.name || (profile.role === 'helper' ? 'Helper on a plan' : '—')} />
        <Detail label="Joined" value={formatDate(profile.joined_at)} />
        {profile.groups.length ? <Detail label="Groups" value={profile.groups.map((group) => group.as === 'staff' ? `${group.name} (staff)` : group.name).join(', ')} /> : null}
      </section>
      <PersonManage orgslug={orgslug} profile={profile} refresh={mutate} />
      {profile.helpers.length ? <Helpers profile={profile} refresh={mutate} /> : null}
      {learner ? <LearnerTeam orgId={orgId} userId={user.id} token={token} /> : null}
      {profile.role !== 'helper' && profile.manage.change_role ? <div><IssueBadge user={user} orgId={orgId} token={token} /></div> : null}
    </EditSheet>
  </div>
}

function TabLink({ href, current, icon, children }: { href: string; current: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return <Link href={href} aria-current={current ? 'page' : undefined}
    className={cn('-mb-px inline-flex h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold', current ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
    {icon}{children}
  </Link>
}

/**
 * Your conversation with them: the chat Message opens for them (their chat with the organization
 * if you staff their group, else a direct chat), with helpers to approve and steps they turned in
 * as cards by time. Before there's a chat, the cards show alone with a way to start one.
 */
function PersonMessage({ orgslug, profile }: { orgslug: string; profile: Profile }) {
  const { token } = usePeopleContext()
  const refreshList = useRefreshPeople()
  const { user } = profile
  const firstName = user.name?.split(' ')[0]
  const { items } = usePersonTimeline(orgslug, user.username, firstName)
  const [chatUuid, setChatUuid] = React.useState(profile.chat_uuid)
  const [opening, setOpening] = React.useState(false)
  const personHref = React.useCallback((person: { username: string }) => getUriWithOrg(orgslug, admin.people.user(person.username)), [orgslug])
  React.useEffect(() => setChatUuid(profile.chat_uuid), [profile.chat_uuid])

  if (chatUuid) return <ChatPane key={chatUuid} bare orgslug={orgslug} chatUuid={chatUuid} listHref={getUriWithOrg(orgslug, admin.people.root())} personHref={personHref}
    onChanged={() => void refreshList()} timeline={items} />

  const start = async () => {
    setOpening(true)
    try {
      const chat = await connectApi.openDirect({ user_uuid: user.user_uuid }, token)
      void refreshList()
      setChatUuid(chat.conversation_uuid)
    } catch (error: any) {
      toast.error(error?.message || 'That chat couldn’t open')
    } finally {
      setOpening(false)
    }
  }
  const sorted = [...items].sort((a, b) => (a.at || '').localeCompare(b.at || ''))
  return <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
    <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-3">
      {sorted.map((item) => <div key={item.key}>{item.node}</div>)}
      <div className="mt-6 text-center">
        {profile.can_message ? <>
          <p className="text-sm text-muted-foreground">{sorted.length ? `No messages with ${firstName || 'them'} yet.` : `Nothing here yet. Say hi to ${firstName || 'them'}.`}</p>
          <button type="button" onClick={() => void start()} disabled={opening} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-60">
            {opening ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}Message {firstName || 'them'}
          </button>
        </> : <p className="mx-auto max-w-sm text-sm text-muted-foreground">{profile.note || (sorted.length ? '' : 'Nothing waiting on you about them.')}</p>}
      </div>
    </div>
  </div>
}

const STATUS: Record<string, string> = { draft: 'Being set up', pending: 'Not accepted yet', active: 'Active', finished: 'Finished', archived: 'Archived' }

function Plans({ orgslug, plans, staff }: { orgslug: string; plans: ProfilePlan[]; staff?: boolean }) {
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
    })}</ul> : <p className="mt-2 text-xs text-gray-500">{staff ? 'Plans belong to learners. The plans they staff are in Plans.' : 'No plans here yet. Plans are given out from Plans.'}</p>}
  </section>
}

function HelpingOn({ orgslug, profile }: { orgslug: string; profile: Profile }) {
  return <section aria-label="Helping on" className="rounded-xl border border-gray-100 bg-white p-5 nice-shadow">
    <h2 className="text-sm font-bold text-gray-900">Helping on</h2>
    <p className="mt-1 text-xs text-gray-500">A learner brought them onto these plans. They see only these plans, and are reached only in each plan&rsquo;s feed.</p>
    {profile.helping_on.length ? <ul className="mt-3 space-y-2">{profile.helping_on.map((item) => <li key={item.collaborator_uuid} className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0 truncate"><span className="font-semibold">{item.title}</span>{item.learner ? <span className="text-gray-500"> · {item.learner.name}</span> : null}</span>
      <Link href={getUriWithOrg(orgslug, admin.learnerFeed(item.goal_uuid))} className="shrink-0 text-xs font-bold underline">Open feed</Link>
    </li>)}</ul> : <p className="mt-2 text-xs text-gray-500">Not on any plan yet.</p>}
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
        aria-label={`Take ${helper.user?.name || 'them'} off ${helper.goal_title}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 md:h-auto md:w-auto md:p-1.5">{busy === helper.collaborator_uuid ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}</button> : null}
    </li>)}</ul>
  </section>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0">
    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
    <p className="truncate text-sm font-medium text-gray-800">{value}</p>
  </div>
}
