'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ExternalLink, Eye, Layers3, Loader2, UserRound, Users, X } from 'lucide-react'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { LearnerRequirementTree } from '@components/Goals/admin/live/LearnerRequirements'
import LearnerBadges from '@components/Badges/award/LearnerBadges'
import LearnerTeam from '@components/Admin/People/LearnerTeam'
import PersonManage from '@components/Admin/People/PersonManage'
import { RoleTag } from '@components/Admin/People/RoleTag'
import { usePeopleContext, useProfile } from '@components/Admin/People/usePeople'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { goalSharingApi } from '@services/goals/sharing'
import { getPublicPortfolio } from '@services/portfolio/portfolio'
import { ROLE_LABELS, type Profile, type ProfilePlan } from '@services/school/people'
import { statusLine } from '@services/organizations/membership'
import type { PersonTab } from '@services/routing/paths'
import { Card, ProfileFrame, ThreadButton, useOpenThread } from './ProfileFrame'

const admin = routePaths.org.admin

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'
}

const firstName = (name?: string) => name?.split(' ')[0] || 'them'

/**
 * Someone's profile under Threads. A learner has Overview (what they're working on, badges, about),
 * Portfolio (what they share), Plans and Access; staff and helpers have Overview and Access.
 */
export default function PersonProfile({ orgslug, username, tab = 'overview', compact }: { orgslug: string; username: string; tab?: PersonTab; compact?: boolean }) {
  const { orgId, token } = usePeopleContext()
  const { data: profile, error, isLoading, mutate } = useProfile(username)
  const openThread = useOpenThread(orgslug)
  const [shown, setShown] = React.useState<PersonTab>(tab)
  React.useEffect(() => setShown(tab), [tab])

  if (isLoading) return <div className="m-auto p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (error || !profile) return <div className="m-auto max-w-sm p-8 text-center">
    <UserRound className="mx-auto mb-3 text-muted-foreground" size={36} />
    <p className="text-sm text-muted-foreground">{error?.message || 'They’re not in this organization.'}</p>
    <Link href={getUriWithOrg(orgslug, admin.threads.root())} className="mt-3 inline-block text-sm font-semibold underline">Back to Threads</Link>
  </div>

  const { user } = profile
  const learner = profile.role === 'learner'
  const tabs: PersonTab[] = learner ? ['overview', 'portfolio', 'plans', 'access'] : ['overview', 'access']
  const current = tabs.includes(shown) ? shown : 'overview'
  const labels: Record<PersonTab, string> = { overview: 'Overview', portfolio: 'Portfolio', plans: `Plans · ${profile.plans.length}`, access: 'Access' }
  const thread = (plan?: string) => openThread({ kind: 'person', userId: user.id, plan })
  const roleName = profile.role_name && profile.role !== 'helper' && profile.role_name !== ROLE_LABELS[profile.role] ? profile.role_name : ''

  return <ProfileFrame orgslug={orgslug} compact={compact} title={user.name}
    art={<PersonAvatar user={user as any} size={compact ? 'lg' : 'xl'} />}
    sub={<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <RoleTag role={profile.role} />
      <span>{[`@${user.username}`, roleName, user.email || ''].filter(Boolean).join(' · ')}</span>
    </span>}
    chips={profile.groups.length ? profile.groups.map((group) => <Link key={`${group.as}-${group.id}`} href={getUriWithOrg(orgslug, admin.people.group(group.id))}
      className="inline-flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-semibold hover:bg-muted"><Users size={12} />{group.name}{group.as === 'staff' ? <span className="font-normal text-muted-foreground">· staff</span> : null}</Link>) : null}
    actions={compact ? null : <ThreadButton primary onClick={() => thread()} />}
    tabs={tabs.map((key) => ({ key, label: labels[key], href: getUriWithOrg(orgslug, admin.people.user(user.username, key)) }))}
    tab={current} onTab={compact ? (key) => setShown(key as PersonTab) : undefined}>
    {current === 'overview' ? <Overview orgslug={orgslug} profile={profile} thread={thread} showPlans={() => compact ? setShown('plans') : undefined} compact={compact} />
      : current === 'portfolio' ? <Portfolio orgslug={orgslug} orgId={orgId} token={token} profile={profile} />
      : current === 'plans' ? <>
        <Plans plans={profile.plans} thread={thread} />
        <Card title="Requirements"><LearnerRequirementTree orgId={orgId} userId={user.id} token={token} /></Card>
      </>
      : <Access orgslug={orgslug} orgId={orgId} token={token} profile={profile} refresh={mutate} />}
  </ProfileFrame>
}

function Overview({ orgslug, profile, thread, showPlans, compact }: { orgslug: string; profile: Profile; thread: (plan?: string) => void; showPlans: () => void; compact?: boolean }) { // eslint-disable-line no-unused-vars
  const { orgId, token } = usePeopleContext()
  const { user } = profile
  if (profile.role === 'helper') return <>
    <HelpingOn orgslug={orgslug} profile={profile} />
    <About profile={profile} />
  </>
  if (profile.role !== 'learner') return <>
    <Card title="Groups they staff">
      {profile.groups.some((group) => group.as === 'staff') ? <ul className="flex flex-wrap gap-2">{profile.groups.filter((group) => group.as === 'staff').map((group) => <li key={group.id}>
        <Link href={getUriWithOrg(orgslug, admin.people.group(group.id))} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted"><Users size={14} />{group.name}</Link>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">Not staff on any group yet.</p>}
    </Card>
    <About profile={profile} />
  </>
  const working = profile.plans.filter((plan) => plan.status === 'active' || plan.status === 'pending')
  return <>
    <Card title="Working on" aside={profile.plans.length ? (compact ? <button type="button" onClick={showPlans} className="text-sm font-semibold text-muted-foreground hover:text-foreground">All plans</button>
      : <Link href={getUriWithOrg(orgslug, admin.people.user(user.username, 'plans'))} className="text-sm font-semibold text-muted-foreground hover:text-foreground">All plans</Link>) : null}>
      {working.length ? <ul className="divide-y divide-border">{working.map((plan) => <PlanRow key={plan.goal_uuid} plan={plan} thread={thread} />)}</ul>
        : <p className="text-sm text-muted-foreground">{firstName(user.name)} isn&rsquo;t working on a plan right now. Plans are given out from Plans.</p>}
    </Card>
    <LearnerBadges orgslug={orgslug} orgId={orgId} token={token} person={{ id: user.id, name: user.name, username: user.username, avatar_image: user.avatar_image, user_uuid: user.user_uuid }} />
    <About profile={profile} />
  </>
}

function About({ profile }: { profile: Profile }) {
  const { user } = profile
  return <Card title="About">
    <dl className="grid gap-4 @lg:grid-cols-2">
      {user.email ? <Detail label="Email" value={user.email} /> : null}
      <Detail label="Role" value={profile.org_role?.name || (profile.role === 'helper' ? 'Helper on a plan' : ROLE_LABELS[profile.role])} />
      <Detail label="Joined" value={formatDate(profile.joined_at)} />
      {profile.status ? <Detail label="Status" value={statusLine(profile.status, profile.status_since)} /> : null}
      {profile.groups.length ? <Detail label="Groups" value={profile.groups.map((group) => group.as === 'staff' ? `${group.name} (staff)` : group.name).join(', ')} /> : null}
    </dl>
  </Card>
}

const STATUS: Record<string, string> = { draft: 'Being set up', pending: 'Not accepted yet', active: 'Active', finished: 'Finished', archived: 'Archived' }

function PlanRow({ plan, thread }: { plan: ProfilePlan; thread: (plan?: string) => void }) { // eslint-disable-line no-unused-vars
  const { done, total, behind, submitted } = plan.progress
  return <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Layers3 size={18} /></span>
    <div className="min-w-[10rem] flex-1">
      <p className="truncate text-sm font-semibold">{plan.title}</p>
      <p className="text-xs text-muted-foreground">
        {STATUS[plan.status] || plan.status}{total ? ` · ${done} of ${total} done` : ''}
        {submitted ? <span className="font-semibold text-blue-600 dark:text-blue-400"> · {submitted} to review</span> : null}
        {behind ? <span className="font-semibold text-red-600 dark:text-red-400"> · {behind} behind</span> : null}
        {plan.assignment_uuid ? '' : plan.source === 'joined' ? ' · Joined from Discover' : ''}
      </p>
      {total ? <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--org-primary-color)]" style={{ width: `${Math.round((done / total) * 100)}%` }} /></div> : null}
    </div>
    <ThreadButton onClick={() => thread(plan.goal_uuid)} />
  </li>
}

function Plans({ plans, thread }: { plans: ProfilePlan[]; thread: (plan?: string) => void }) { // eslint-disable-line no-unused-vars
  return <Card title="Plans">
    {plans.length ? <ul className="divide-y divide-border">{plans.map((plan) => <PlanRow key={plan.goal_uuid} plan={plan} thread={thread} />)}</ul>
      : <p className="text-sm text-muted-foreground">No plans here yet. Plans are given out from Plans.</p>}
  </Card>
}

/** What the learner shares: their portfolio as you may see it, without anything they marked private. */
function Portfolio({ orgslug, orgId, token, profile }: { orgslug: string; orgId: number; token?: string; profile: Profile }) {
  const { user } = profile
  const { data: shell, error, isLoading } = useSWR(orgId && token ? ['threads-portfolio', orgId, user.username] : null, () => getPublicPortfolio(orgId, user.username, token), { revalidateOnFocus: false, shouldRetryOnError: false })
  const name = firstName(user.name)
  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (error || !shell) return <Card><p className="text-sm text-muted-foreground">{name} hasn&rsquo;t shared a portfolio with you. It shows here once they publish it or add you to it.</p></Card>
  const portfolio = shell.portfolio || {}
  const projects: any[] = shell.projects || []
  const timeline: any[] = Array.isArray(shell.timeline) ? shell.timeline : []
  const published = Boolean(portfolio.published_at) && portfolio.visibility !== 'private'
  return <>
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
      <Eye size={16} className="shrink-0" />
      <span className="min-w-[12rem] flex-1">What {name} shares{shell.access?.shared_privately ? ' with you' : ''}. Anything they marked private stays hidden.</span>
      {published ? <a href={getUriWithOrg(orgslug, routePaths.org.user(user.username))} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-sm font-semibold text-foreground hover:bg-muted"><ExternalLink size={14} />Public page</a> : null}
    </div>
    <Card>
      <div className="flex items-center gap-4">
        <PersonAvatar user={user as any} size="lg" />
        <div className="min-w-0">
          <p className="text-lg font-black tracking-tight">{portfolio.display_name || user.name}</p>
          {portfolio.headline ? <p className="text-sm font-semibold">{portfolio.headline}</p> : null}
          {portfolio.short_bio ? <p className="mt-1 text-sm text-muted-foreground">{portfolio.short_bio}</p> : null}
        </div>
      </div>
    </Card>
    <section aria-label="Projects">
      <h2 className="mb-3 text-lg font-bold">Projects <span className="text-sm font-semibold text-muted-foreground">{projects.length} shared</span></h2>
      {projects.length ? <ul className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">{projects.map((project) => <li key={project.project_uuid || project.slug} className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="aspect-[16/10] bg-muted">{project.cover_url ? <img src={project.cover_url} alt="" className="h-full w-full object-cover" /> : null}</div>
        <div className="p-3">
          <p className="truncate text-sm font-semibold">{project.title}</p>
          {project.subtitle || project.summary ? <p className="line-clamp-2 text-xs text-muted-foreground">{project.subtitle || project.summary}</p> : null}
        </div>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No projects shared yet.</p>}
    </section>
    {timeline.length ? <Card title="Timeline">
      <ol className="space-y-3">{timeline.map((entry) => <li key={entry.timeline_uuid || entry.slug} className="flex gap-3">
        <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[var(--org-primary-color)]" />
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">{[entry.start_date, entry.is_ongoing ? 'now' : entry.end_date].filter(Boolean).join(' – ')}</span>
          <span className="block text-sm font-semibold">{entry.title}{entry.organization ? <span className="font-normal text-muted-foreground"> at {entry.organization}</span> : null}</span>
        </span>
      </li>)}</ol>
    </Card> : null}
  </>
}

/** Role, permissions, status and groups (for admins), helpers and their school team. */
function Access({ orgslug, orgId, token, profile, refresh }: { orgslug: string; orgId: number; token?: string; profile: Profile; refresh: () => Promise<unknown> }) {
  const learner = profile.role === 'learner'
  const { manage } = profile
  const canManage = manage.change_role || manage.remove || manage.groups || manage.status || manage.permissions
  return <>
    {canManage ? <PersonManage orgslug={orgslug} profile={profile} refresh={refresh} /> : <About profile={profile} />}
    {profile.helpers.length ? <Helpers profile={profile} refresh={refresh} /> : null}
    {learner ? <LearnerTeam orgId={orgId} userId={profile.user.id} token={token} /> : null}
  </>
}

function HelpingOn({ orgslug, profile }: { orgslug: string; profile: Profile }) {
  return <Card title="Helping on">
    <p className="-mt-1 mb-3 text-xs text-muted-foreground">A learner brought them onto these plans. They see only these plans, and are reached only in each plan&rsquo;s feed.</p>
    {profile.helping_on.length ? <ul className="space-y-2">{profile.helping_on.map((item) => <li key={item.collaborator_uuid} className="flex items-center justify-between gap-3 text-sm">
      <span className="min-w-0 truncate"><span className="font-semibold">{item.title}</span>{item.learner ? <span className="text-muted-foreground"> · {item.learner.name}</span> : null}</span>
      <Link href={getUriWithOrg(orgslug, admin.learnerFeed(item.goal_uuid))} className="shrink-0 text-xs font-bold underline">Open feed</Link>
    </li>)}</ul> : <p className="text-sm text-muted-foreground">Not on any plan yet.</p>}
  </Card>
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
  return <Card title="Helpers">
    <p className="-mt-1 mb-3 text-xs text-muted-foreground">People {profile.user.name} brought onto their plans, such as a parent. They see only that plan.</p>
    <ul className="space-y-2">{profile.helpers.map((helper) => <li key={helper.collaborator_uuid} className="flex items-center gap-3">
      <PersonAvatar user={helper.user as any} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm"><span className="font-semibold">{helper.user?.name || 'Someone'}</span><span className="text-muted-foreground"> · {helper.role} on {helper.goal_title}</span></span>
      {profile.manage.remove_helper ? <button type="button" onClick={() => void remove(helper.goal_uuid, helper.collaborator_uuid, helper.user?.name || 'them')} disabled={Boolean(busy)}
        aria-label={`Take ${helper.user?.name || 'them'} off ${helper.goal_title}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">{busy === helper.collaborator_uuid ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}</button> : null}
    </li>)}</ul>
  </Card>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0">
    <dt className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="truncate text-sm font-medium">{value}</dd>
  </div>
}
