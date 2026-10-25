'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Building2, MessageSquareText, Plus, UserPlus, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { useFeatures } from '@components/Hooks/useFeatures'
import InviteUsersDialog, { JoinLinkPanel } from '@components/Dashboard/Pages/Users/OrgUsersAdd/InviteUsersDialog'
import PendingInvites from '@components/Admin/People/PendingInvites'
import { RoleTag } from '@components/Admin/People/RoleTag'
import { useOrgGroups, usePeopleContext, usePeopleFeed, useRefreshPeople } from '@components/Admin/People/usePeople'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrgUsage, type LimitUsage } from '@services/plans/access'
import { TIER_LABELS } from '@services/plans/plans'
import type { FeedRow } from '@services/school/people'
import type { OrgTab } from '@services/routing/paths'
import { Card, ProfileFrame, ThreadButton, useOpenThread } from './ProfileFrame'

const people = routePaths.org.admin.people

/** The organization's profile under Threads: Overview (seats, staff, groups), Invites and Join links. */
export default function OrgProfile({ orgslug, tab = 'overview', compact }: { orgslug: string; tab?: OrgTab; compact?: boolean }) {
  const { org, orgId, token, isAdmin } = usePeopleContext()
  const openThread = useOpenThread(orgslug)
  const refreshList = useRefreshPeople()
  const [inviting, setInviting] = React.useState(false)
  const [shown, setShown] = React.useState<OrgTab>(tab)
  React.useEffect(() => setShown(tab), [tab])
  const { data: usage } = useSWR(orgId && token ? ['org-usage', orgId] : null, () => getOrgUsage(orgId, token as string), { revalidateOnFocus: false, shouldRetryOnError: false })
  const tabs: OrgTab[] = isAdmin ? ['overview', 'invites', 'join'] : ['overview']
  const current = tabs.includes(shown) ? shown : 'overview'
  const labels: Record<OrgTab, string> = { overview: 'Overview', invites: 'Invites', join: 'Join links' }

  return <ProfileFrame orgslug={orgslug} compact={compact} title={org?.name || 'Organization'}
    art={<span className={cn('grid shrink-0 place-items-center rounded-2xl bg-[var(--org-primary-color,#111)] text-white', compact ? 'h-12 w-12' : 'h-20 w-20')}><Building2 size={compact ? 22 : 34} /></span>}
    sub={usage ? `${TIER_LABELS[usage.tier]} plan` : null}
    actions={compact ? null : <>
      <ThreadButton onClick={() => openThread({ kind: 'org' })} />
      {isAdmin ? <button type="button" onClick={() => setInviting(true)} className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90"><UserPlus size={16} />Add people</button> : null}
    </>}
    tabs={tabs.map((key) => ({ key, label: labels[key], href: getUriWithOrg(orgslug, people.org(key)) }))}
    tab={current} onTab={compact ? (key) => setShown(key as OrgTab) : undefined}>
    {current === 'overview' ? <Overview orgslug={orgslug} usage={usage?.limits} onAddStaff={isAdmin ? () => setInviting(true) : undefined} openStaff={(id) => openThread({ kind: 'person', userId: id })} openGroup={(id) => openThread({ kind: 'group', groupId: id })} />
      : current === 'invites' ? <Card title="Invited, not joined yet" aside={<button type="button" onClick={() => setInviting(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-semibold hover:bg-muted"><Plus size={14} />Add people</button>}>
        <PendingInvites empty="Nobody is waiting on an invitation." />
      </Card>
      : <JoinLinks />}
    <InviteUsersDialog open={inviting} onOpenChange={setInviting} onInvited={() => void refreshList()} />
  </ProfileFrame>
}

/* eslint-disable no-unused-vars */
function Overview({ orgslug, usage, onAddStaff, openStaff, openGroup }: { orgslug: string; usage?: { learners: LimitUsage; staff_seats: LimitUsage }; onAddStaff?: () => void; openStaff: (id: number) => void; openGroup: (id: number) => void }) {
/* eslint-enable no-unused-vars */
  const { data: staff } = usePeopleFeed('', 0, 'active', 'staff')
  const { data: groups } = usePeopleFeed('', 0, 'active', 'groups')
  const rows = (feed?: { active: FeedRow[]; rest: FeedRow[] }) => feed ? [...feed.active, ...feed.rest] : []
  const staffRows = rows(staff).filter((row) => row.person)
  const groupRows = rows(groups).filter((row) => row.group)
  return <>
    <Card title="Seats">
      <div className="grid gap-5 @lg:grid-cols-2">
        <Meter label="active learners" usage={usage?.learners} />
        <Meter label="staff seats" usage={usage?.staff_seats} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Alumni don&rsquo;t count toward your learners.</p>
    </Card>
    <Card title="Staff" aside={onAddStaff ? <button type="button" onClick={onAddStaff} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-semibold hover:bg-muted"><UserPlus size={14} />Add staff</button> : null}>
      {staffRows.length ? <ul className="divide-y divide-border">{staffRows.map((row) => <li key={row.key} className="flex items-center gap-3 py-2.5">
        <Link href={getUriWithOrg(orgslug, people.user(row.person!.username))} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">
          <PersonAvatar user={row.person as any} size="md" />
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{row.person!.name}</span><span className="block truncate text-xs text-muted-foreground">{row.role_name || '@' + row.person!.username}</span></span>
        </Link>
        {row.role === 'admin' ? <RoleTag role="admin" /> : null}
        <RowThread onClick={() => openStaff(row.person!.id)} name={row.person!.name} />
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No other staff yet.</p>}
    </Card>
    <OrgGroups orgslug={orgslug} rows={groupRows} openGroup={openGroup} />
  </>
}

/* eslint-disable-next-line no-unused-vars */
function OrgGroups({ orgslug, rows, openGroup }: { orgslug: string; rows: FeedRow[]; openGroup: (id: number) => void }) {
  return <Card title="Groups">
    {rows.length ? <ul className="divide-y divide-border">{rows.map((row) => <li key={row.key} className="flex items-center gap-3 py-2.5">
      <Link href={getUriWithOrg(orgslug, people.group(row.group!.id))} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><Users size={16} /></span>
        <span className="min-w-0"><span className="block truncate text-sm font-semibold">{row.group!.name}</span><span className="block truncate text-xs text-muted-foreground">{row.group!.member_count} {row.group!.member_count === 1 ? 'person' : 'people'}</span></span>
      </Link>
      <RowThread onClick={() => openGroup(row.group!.id)} name={row.group!.name} />
    </li>)}</ul> : <p className="text-sm text-muted-foreground">No groups yet. Groups gather a class or cohort so you can hand out plans and talk to them together.</p>}
  </Card>
}

function RowThread({ onClick, name }: { onClick: () => void; name: string }) {
  return <button type="button" onClick={onClick} aria-label={`Open the thread with ${name}`} title="Thread" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><MessageSquareText size={16} /></button>
}

function Meter({ label, usage }: { label: string; usage?: LimitUsage }) {
  if (!usage) return <div className="h-10 animate-pulse rounded-lg bg-muted" />
  const unlimited = usage.limit === 'unlimited'
  const percent = unlimited ? 0 : Math.min(100, Math.round((usage.usage / Math.max(1, usage.limit as number)) * 100))
  return <div>
    <p className="text-sm"><b>{usage.usage}</b>{unlimited ? '' : ` of ${usage.limit}`} {label}</p>
    {unlimited ? null : <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', usage.limit_reached ? 'bg-amber-500' : 'bg-[var(--org-primary-color,#2563eb)]')} style={{ width: `${percent}%` }} /></div>}
  </div>
}

function JoinLinks() {
  const { org, token } = usePeopleContext()
  const features = useFeatures()
  const groupsEnabled = features.has('groups')
  const { data: groups } = useOrgGroups(groupsEnabled)
  return <Card title="Join links">
    <p className="-mt-1 mb-4 text-sm text-muted-foreground">A link or QR code learners use to join. Pick a group and they join it too.</p>
    <JoinLinkPanel org={org} accessToken={token || ''} usergroups={groups || []} groupsEnabled={groupsEnabled} bulkInvites={features.has('bulk_invites')} />
  </Card>
}
